
"use strict";

// =====================================================
// BORROWING REQUEST MANAGEMENT
// =====================================================

const supabaseClient = window.supabaseClient;

let currentUser = null;
let currentProfile = null;
let currentRequests = [];
let availableEquipment = [];
let isSubmitting = false;

document.addEventListener("DOMContentLoaded", initializeBorrowingPage);

// =====================================================
// INITIALIZATION
// =====================================================

async function initializeBorrowingPage() {
  if (!supabaseClient) {
    showPageMessage("Supabase is not initialized. Check js/supabase.js and script order.", "error");
    return;
  }

  try {
    const { data, error } = await supabaseClient.auth.getUser();

    if (error || !data?.user) {
      window.location.href = "login.html";
      return;
    }

    currentUser = data.user;

    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("id, full_name, role")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (profileError) {
      throw new Error("Unable to load your profile: " + profileError.message);
    }

    if (!profile) {
      showPageMessage("No profile was found for this account. Contact your administrator.", "error");
      return;
    }

    currentProfile = profile;
    const role = normalizeRole(profile.role);

    if (!role) {
      showPageMessage("Your account has an unrecognized role. Contact your administrator.", "error");
      return;
    }

    sessionStorage.setItem("userId", currentUser.id);
    sessionStorage.setItem("userRole", role);
    sessionStorage.setItem("userName", profile.full_name || "");
    sessionStorage.setItem("userEmail", currentUser.email || "");

    const userInfo = document.getElementById("userInfo");
    if (userInfo) {
      userInfo.textContent =
        `${profile.full_name || currentUser.email} • ${formatRole(role)}`;
    }

    setupRoleAccess(role);
    bindEvents();

    await loadAvailableEquipment();
    await loadBorrowingRequests();
  } catch (error) {
    console.error("Borrowing initialization failed:", error);
    showPageMessage(error.message || "Unable to initialize the Borrowing page.", "error");
  }
}

// =====================================================
// ROLE HELPERS
// =====================================================

function normalizeRole(role) {
  const value = String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[\s/-]+/g, "_");

  if (["admin", "administrator"].includes(value)) return "administrator";

  if (["staff", "laboratory_staff", "lab_staff"].includes(value)) {
    return "staff";
  }

  if (["requester", "viewer", "requester_viewer"].includes(value)) {
    return "requester";
  }

  return "";
}

function formatRole(role) {
  const labels = {
    administrator: "Administrator",
    staff: "Laboratory Staff",
    requester: "Requester / Viewer"
  };

  return labels[role] || role;
}

function setupRoleAccess(role) {
  document.querySelectorAll("[data-access]").forEach(element => {
    const roles = element.getAttribute("data-access")
      .split(/\s+/)
      .map(normalizeRole)
      .filter(Boolean);

    element.style.display = roles.includes(role) ? "" : "none";
  });

  const formSection = document.getElementById("borrowingFormSection");

  if (formSection) {
    formSection.style.display =
      ["administrator", "staff", "requester"].includes(role) ? "" : "none";
  }
}

function canSubmitRequest() {
  return ["administrator", "staff", "requester"].includes(
    normalizeRole(currentProfile?.role)
  );
}

function canProcessRequests() {
  return ["administrator", "staff"].includes(
    normalizeRole(currentProfile?.role)
  );
}

// =====================================================
// EVENTS
// =====================================================

function bindEvents() {
  document.getElementById("borrowingForm")
    ?.addEventListener("submit", submitBorrowingRequest);

  document.getElementById("searchInput")
    ?.addEventListener("input", applyFilters);

  document.getElementById("statusFilter")
    ?.addEventListener("change", applyFilters);

  document.getElementById("cancelBorrowingBtn")
    ?.addEventListener("click", resetBorrowingForm);

  document.getElementById("logoutBtn")
    ?.addEventListener("click", logout);

  document.getElementById("equipmentSelect")
    ?.addEventListener("change", updateQuantityHint);

  document.getElementById("closeDetailsBtn")
    ?.addEventListener("click", () => {
      document.getElementById("requestDetailsSection")?.classList.add("hidden");
    });
}

// =====================================================
// LOAD AVAILABLE EQUIPMENT
// =====================================================

async function loadAvailableEquipment() {
  const select = document.getElementById("equipmentSelect");
  if (!select) return;

  select.replaceChildren(new Option("Loading available equipment...", ""));

  const { data, error } = await supabaseClient
    .from("equipment")
    .select("id, equipment_code, equipment_name, quantity, status")
    .gt("quantity", 0)
    .order("equipment_code", { ascending: true });

  if (error) {
    console.error("Equipment loading error:", error);
    select.replaceChildren(new Option("Unable to load equipment", ""));
    showRequestMessage("Equipment could not be loaded: " + error.message, "error");
    return;
  }

  // Accept harmless capitalization differences in the status value.
  availableEquipment = (data || []).filter(item =>
    String(item.status || "").trim().toLowerCase() === "available" &&
    Number(item.quantity) > 0
  );

  select.replaceChildren(new Option(
    availableEquipment.length ? "Select available equipment" : "No available equipment",
    ""
  ));

  availableEquipment.forEach(item => {
    const option = new Option(
      `${item.equipment_code || "EQ-" + item.id} - ${item.equipment_name} (${item.quantity} available)`,
      String(item.id)
    );

    select.add(option);
  });

  updateQuantityHint();
}

function updateQuantityHint() {
  const select = document.getElementById("equipmentSelect");
  const quantityInput = document.getElementById("quantity");
  const hint = document.getElementById("availableQuantityHint");

  if (!select || !quantityInput || !hint) return;

  const item = availableEquipment.find(
    equipment => String(equipment.id) === select.value
  );

  if (!item) {
    quantityInput.removeAttribute("max");
    hint.textContent = "";
    return;
  }

  quantityInput.max = String(item.quantity);
  hint.textContent = `Available quantity: ${item.quantity}`;
}

// =====================================================
// SUBMIT REQUEST
// =====================================================

async function submitBorrowingRequest(event) {
  event.preventDefault();

  if (isSubmitting) return;

  if (!currentUser || !currentProfile || !canSubmitRequest()) {
    showRequestMessage("Your account is not allowed to submit requests.", "error");
    return;
  }

  const select = document.getElementById("equipmentSelect");
  const quantityInput = document.getElementById("quantity");
  const purposeInput = document.getElementById("purpose");
  const submitButton = document.getElementById("submitRequestBtn");

  const equipmentId = Number(select?.value);
  const quantity = Number(quantityInput?.value);
  const purpose = purposeInput?.value.trim();

  if (!Number.isSafeInteger(equipmentId) || equipmentId <= 0) {
    showRequestMessage("Please select available equipment.", "error");
    return;
  }

  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    showRequestMessage("Quantity must be a whole number of at least 1.", "error");
    return;
  }

  if (!purpose) {
    showRequestMessage("Please enter the purpose of borrowing.", "error");
    return;
  }

  isSubmitting = true;
  if (submitButton) submitButton.disabled = true;

  try {
    // Recheck current database values before creating the request.
    const { data: equipment, error: equipmentError } = await supabaseClient
      .from("equipment")
      .select("id, equipment_code, equipment_name, quantity, status")
      .eq("id", equipmentId)
      .maybeSingle();

    if (equipmentError) throw equipmentError;

    if (!equipment) {
      throw new Error("The selected equipment no longer exists.");
    }

    if (String(equipment.status || "").trim().toLowerCase() !== "available") {
      await loadAvailableEquipment();
      throw new Error("This equipment is not available for borrowing.");
    }

    if (quantity > Number(equipment.quantity)) {
      await loadAvailableEquipment();
      throw new Error(`Only ${equipment.quantity} unit(s) are available.`);
    }

    const { data: request, error: requestError } = await supabaseClient
      .from("borrowing_requests")
      .insert({
        equipment_id: equipmentId,
        requester_id: currentUser.id,
        quantity,
        purpose,
        request_date: new Date().toISOString(),
        status: "Pending"
      })
      .select("id, equipment_id, requester_id, quantity, purpose, request_date, status, approved_by, approved_at, released_at, returned_at")
      .single();

    if (requestError) throw requestError;

    await createAuditLog(
      "CREATE",
      "Borrowing Requests",
      request.id,
      `Created borrowing request for ${equipment.equipment_code || equipment.equipment_name}`
    );

    showRequestMessage("Borrowing request submitted successfully.", "success");
    resetBorrowingForm();
    await loadBorrowingRequests();
  } catch (error) {
    console.error("Submit request error:", error);
    showRequestMessage(error.message || "Unable to submit the request.", "error");
  } finally {
    isSubmitting = false;
    if (submitButton) submitButton.disabled = false;
  }
}

// =====================================================
// LOAD BORROWING REQUESTS
// Uses columns visible in the provided database diagram.
// =====================================================

async function loadBorrowingRequests() {
  const tableBody = document.getElementById("borrowingTableBody");
  const recordCount = document.getElementById("recordCount");

  if (!tableBody) return;

  tableBody.innerHTML =
    '<tr><td colspan="9" class="loading-state">Loading borrowing requests...</td></tr>';

  const role = normalizeRole(currentProfile?.role);

  let query = supabaseClient
    .from("borrowing_requests")
    .select("id, equipment_id, requester_id, quantity, purpose, request_date, status, approved_by, approved_at, released_at, returned_at")
    .order("request_date", { ascending: false });

  if (role === "requester") {
    query = query.eq("requester_id", currentUser.id);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Borrowing query error:", error);
    tableBody.innerHTML = "";
    showTableError(error.message);
    return;
  }

  const requests = data || [];

  const equipmentIds = [...new Set(
    requests.map(item => item.equipment_id).filter(id => id != null)
  )];

  const profileIds = [...new Set(
    requests.flatMap(item => [item.requester_id, item.approved_by])
      .filter(Boolean)
  )];

  const equipmentMap = {};
  const profileMap = {};

  if (equipmentIds.length) {
    const { data: equipmentRows, error: equipmentError } = await supabaseClient
      .from("equipment")
      .select("id, equipment_code, equipment_name, quantity, status")
      .in("id", equipmentIds);

    if (equipmentError) {
      console.error("Related equipment error:", equipmentError);
    } else {
      (equipmentRows || []).forEach(item => {
        equipmentMap[String(item.id)] = item;
      });
    }
  }

  if (profileIds.length) {
    const { data: profiles, error: profileError } = await supabaseClient
      .from("profiles")
      .select("id, full_name")
      .in("id", profileIds);

    if (profileError) {
      console.error("Related profile error:", profileError);
    } else {
      (profiles || []).forEach(item => {
        profileMap[item.id] = item;
      });
    }
  }

  currentRequests = requests.map(request => ({
    ...request,
    equipmentInfo: equipmentMap[String(request.equipment_id)] || null,
    requesterInfo: profileMap[request.requester_id] || null,
    approverInfo: request.approved_by
      ? profileMap[request.approved_by] || null
      : null
  }));

  if (recordCount) {
    recordCount.textContent = `${currentRequests.length} record${currentRequests.length === 1 ? "" : "s"}`;
  }

  applyFilters();
}

// =====================================================
// RENDER TABLE AND FILTERS
// =====================================================

function applyFilters() {
  const search = (document.getElementById("searchInput")?.value || "")
    .trim()
    .toLowerCase();

  const selectedStatus = document.getElementById("statusFilter")?.value || "";

  const filtered = currentRequests.filter(request => {
    const equipment = request.equipmentInfo;
    const requester = request.requesterInfo;

    const text = [
      request.id,
      equipment?.equipment_code,
      equipment?.equipment_name,
      requester?.full_name,
      request.purpose,
      request.status
    ].filter(value => value != null).join(" ").toLowerCase();

    return text.includes(search) &&
      (!selectedStatus || request.status === selectedStatus);
  });

  renderBorrowingRequests(filtered);

  const count = document.getElementById("recordCount");
  if (count) {
    count.textContent = `${filtered.length} record${filtered.length === 1 ? "" : "s"}`;
  }
}

function renderBorrowingRequests(requests) {
  const body = document.getElementById("borrowingTableBody");
  if (!body) return;

  body.replaceChildren();

  if (!requests.length) {
    const row = body.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 9;
    cell.textContent = "No borrowing requests found.";
    return;
  }

  const role = normalizeRole(currentProfile?.role);

  requests.forEach(request => {
    const row = body.insertRow();
    const equipment = request.equipmentInfo;
    const requester = request.requesterInfo;
    const approver = request.approverInfo;

    addCell(row, `#${request.id}`);
    addCell(row, equipment
      ? `${equipment.equipment_code || "EQ-" + equipment.id} - ${equipment.equipment_name || ""}`
      : "Equipment unavailable");
    addCell(row, requester?.full_name || "Unknown requester");
    addCell(row, request.quantity);
    addCell(row, request.purpose || "");
    addCell(row, formatDate(request.request_date));

    const statusCell = row.insertCell();
    const badge = document.createElement("span");
    badge.className = `status ${getStatusClass(request.status)}`;
    badge.textContent = request.status || "Unknown";
    statusCell.appendChild(badge);

    addCell(row, approver?.full_name || "-");

    const actionsCell = row.insertCell();

    addActionButton(actionsCell, "View", "view-btn", () => viewBorrowingRequest(request.id));

    if (role === "administrator" && request.status === "Pending") {
      addActionButton(actionsCell, "Approve", "approve-btn", () => approveRequest(request.id));
      addActionButton(actionsCell, "Reject", "reject-btn", () => rejectRequest(request.id));
    }

    if (canProcessRequests() && request.status === "Approved") {
      addActionButton(actionsCell, "Release", "release-btn", () => releaseRequest(request.id));
    }

    if (canProcessRequests() && request.status === "Released") {
      addActionButton(actionsCell, "Return", "return-btn", () => returnRequest(request.id));
    }
  });
}

function addCell(row, value) {
  const cell = row.insertCell();
  cell.textContent = value == null ? "" : String(value);
  return cell;
}

function addActionButton(container, label, className, callback) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", callback);
  container.appendChild(button);
}

// =====================================================
// APPROVE / REJECT
// Administrator only; database RLS must enforce this too.
// =====================================================

async function approveRequest(requestId) {
  await changePendingRequest(requestId, "Approved", "APPROVE");
}

async function rejectRequest(requestId) {
  await changePendingRequest(requestId, "Rejected", "REJECT");
}

async function changePendingRequest(requestId, newStatus, action) {
  if (normalizeRole(currentProfile?.role) !== "administrator") {
    alert("Only the Administrator can approve or reject requests.");
    return;
  }

  const request = currentRequests.find(item => Number(item.id) === Number(requestId));

  if (!request || request.status !== "Pending") {
    alert("Only existing Pending requests can be processed.");
    return;
  }

  if (request.requester_id === currentUser.id) {
    alert("You cannot approve or reject your own request.");
    return;
  }

  if (!confirm(`${newStatus} borrowing request #${requestId}?`)) return;

  const { data, error } = await supabaseClient
    .from("borrowing_requests")
    .update({
      status: newStatus,
      approved_by: currentUser.id,
      approved_at: new Date().toISOString()
    })
    .eq("id", requestId)
    .eq("status", "Pending")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error(`${action} error:`, error);
    alert(`Unable to update request: ${error.message}`);
    return;
  }

  if (!data) {
    alert("The request was changed by another user or your permissions do not allow this operation.");
    await loadBorrowingRequests();
    return;
  }

  await createAuditLog(action, "Borrowing Requests", requestId,
    `${newStatus} borrowing request #${requestId}`);

  alert(`Request ${newStatus.toLowerCase()} successfully.`);
  await loadBorrowingRequests();
}

// =====================================================
// RELEASE
// =====================================================

async function releaseRequest(requestId) {
  if (!canProcessRequests()) {
    alert("Only Administrator or Laboratory Staff can release equipment.");
    return;
  }

  const request = currentRequests.find(item => Number(item.id) === Number(requestId));

  if (!request || request.status !== "Approved") {
    alert("Only Approved requests can be released.");
    return;
  }

  const { data: equipment, error: equipmentError } = await supabaseClient
    .from("equipment")
    .select("id, equipment_code, equipment_name, quantity, status")
    .eq("id", request.equipment_id)
    .maybeSingle();

  if (equipmentError || !equipment) {
    alert(equipmentError?.message || "Equipment record not found.");
    return;
  }

  if (String(equipment.status || "").trim().toLowerCase() !== "available") {
    alert("This equipment is no longer available.");
    return;
  }

  if (Number(equipment.quantity) < Number(request.quantity)) {
    alert("There is not enough equipment available.");
    return;
  }

  if (!confirm(`Release equipment for request #${requestId}?`)) return;

  // The current schema has one status field for the equipment record.
  // It cannot track per-unit availability independently.
  const { data: changedEquipment, error: equipmentUpdateError } = await supabaseClient
    .from("equipment")
    .update({ status: "Borrowed" })
    .eq("id", equipment.id)
    .eq("status", equipment.status)
    .select("id")
    .maybeSingle();

  if (equipmentUpdateError || !changedEquipment) {
    alert(equipmentUpdateError?.message || "Equipment status changed. Refresh and try again.");
    return;
  }

  const { data: changedRequest, error: requestError } = await supabaseClient
    .from("borrowing_requests")
    .update({
      status: "Released",
      released_at: new Date().toISOString()
    })
    .eq("id", requestId)
    .eq("status", "Approved")
    .select("id")
    .maybeSingle();

  if (requestError || !changedRequest) {
    // Best-effort rollback. For full transactional safety, use a database RPC.
    await supabaseClient
      .from("equipment")
      .update({ status: equipment.status })
      .eq("id", equipment.id)
      .eq("status", "Borrowed");

    alert(requestError?.message || "Request status changed. Refresh and try again.");
    await loadBorrowingRequests();
    return;
  }

  await createAuditLog("RELEASE", "Borrowing Requests", requestId,
    `Released ${equipment.equipment_code || equipment.equipment_name} for request #${requestId}`);

  alert("Equipment released successfully.");
  await loadAvailableEquipment();
  await loadBorrowingRequests();
}

// =====================================================
// RETURN
// Ask whether the returned equipment is damaged.
// =====================================================

async function returnRequest(requestId) {
  if (!canProcessRequests()) {
    alert("Only Administrator or Laboratory Staff can process returns.");
    return;
  }

  const request = currentRequests.find(item => Number(item.id) === Number(requestId));

  if (!request || request.status !== "Released") {
    alert("Only Released requests can be returned.");
    return;
  }

  const condition = prompt(
    "Enter the returned equipment condition: Available or Damaged",
    "Available"
  );

  if (condition === null) return;

  const normalizedCondition = condition.trim().toLowerCase();

  if (!["available", "damaged"].includes(normalizedCondition)) {
    alert('Enter either "Available" or "Damaged".');
    return;
  }

  if (!confirm(`Process return for request #${requestId} as ${normalizedCondition}?`)) {
    return;
  }

  const { data: equipment, error: equipmentError } = await supabaseClient
    .from("equipment")
    .select("id, equipment_code, equipment_name, status")
    .eq("id", request.equipment_id)
    .maybeSingle();

  if (equipmentError || !equipment) {
    alert(equipmentError?.message || "Equipment record not found.");
    return;
  }

  const newStatus = normalizedCondition === "damaged" ? "Damaged" : "Available";

  const { data: changedRequest, error: requestError } = await supabaseClient
    .from("borrowing_requests")
    .update({
      status: "Returned",
      returned_at: new Date().toISOString()
    })
    .eq("id", requestId)
    .eq("status", "Released")
    .select("id")
    .maybeSingle();

  if (requestError || !changedRequest) {
    alert(requestError?.message || "This request was already processed or your permissions do not allow it.");
    await loadBorrowingRequests();
    return;
  }

  const { error: equipmentUpdateError } = await supabaseClient
    .from("equipment")
    .update({ status: newStatus })
    .eq("id", equipment.id);

  if (equipmentUpdateError) {
    console.error("Equipment status update failed:", equipmentUpdateError);
    alert("The request was marked Returned, but equipment status could not be updated. Contact your administrator.");
    await loadBorrowingRequests();
    return;
  }

  await createAuditLog("RETURN", "Borrowing Requests", requestId,
    `Returned ${equipment.equipment_code || equipment.equipment_name}; condition: ${newStatus}`);

  alert("Equipment return processed successfully.");
  await loadAvailableEquipment();
  await loadBorrowingRequests();
}

// =====================================================
// VIEW REQUEST DETAILS
// =====================================================

function viewBorrowingRequest(requestId) {
  const request = currentRequests.find(item => Number(item.id) === Number(requestId));

  if (!request) {
    alert("Request not found.");
    return;
  }

  const details = document.getElementById("requestDetails");
  const section = document.getElementById("requestDetailsSection");

  if (!details || !section) return;

  details.replaceChildren();

  const equipment = request.equipmentInfo;
  const requester = request.requesterInfo;
  const approver = request.approverInfo;

  const fields = [
    ["Request ID", request.id],
    ["Equipment", equipment
      ? `${equipment.equipment_code || ""} - ${equipment.equipment_name || ""}`
      : "Unknown equipment"],
    ["Requester", requester?.full_name || "Unknown requester"],
    ["Quantity", request.quantity],
    ["Purpose", request.purpose],
    ["Request Date", formatDate(request.request_date)],
    ["Status", request.status],
    ["Approved By", approver?.full_name || "-"],
    ["Approved At", formatDate(request.approved_at)],
    ["Released At", formatDate(request.released_at)],
    ["Returned At", formatDate(request.returned_at)]
  ];

  fields.forEach(([label, value]) => {
    const paragraph = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    paragraph.append(strong, document.createTextNode(String(value ?? "-")));
    details.appendChild(paragraph);
  });

  section.classList.remove("hidden");
  section.scrollIntoView({ behavior: "smooth", block: "start" });
}

// =====================================================
// AUDIT LOGGING
// =====================================================

async function createAuditLog(action, module, recordId, description) {
  try {
    const { error } = await supabaseClient
      .from("audit_logs")
      .insert({
        user_id: currentUser.id,
        action,
        module,
        record_id: recordId,
        description
      });

    if (error) {
      console.error("Audit log insertion failed:", error);
      showPageMessage(
        "The operation completed, but its audit entry could not be saved. Contact your administrator.",
        "error"
      );
    }
  } catch (error) {
    console.error("Audit logging exception:", error);
  }
}

// =====================================================
// FORM RESET
// =====================================================

function resetBorrowingForm() {
  document.getElementById("borrowingForm")?.reset();

  const quantity = document.getElementById("quantity");
  if (quantity) quantity.value = "1";

  updateQuantityHint();
  clearMessage("borrowingMessage");
}

// =====================================================
// MESSAGES AND ERRORS
// =====================================================

function showRequestMessage(message, type) {
  showMessage("borrowingMessage", message, type);
}

function showPageMessage(message, type) {
  showMessage("pageMessage", message, type);
}

function showMessage(elementId, message, type) {
  const element = document.getElementById(elementId);

  if (!element) {
    console[type === "error" ? "error" : "log"](message);
    return;
  }

  element.textContent = message;
  element.className = type || "";
}

function clearMessage(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.textContent = "";
    element.className = "";
  }
}

function showTableError(message) {
  const body = document.getElementById("borrowingTableBody");
  const count = document.getElementById("recordCount");

  if (count) count.textContent = "Error";

  if (body) {
    body.replaceChildren();
    const row = body.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 9;
    cell.textContent = `Unable to load borrowing requests: ${message}`;
  }
}

// =====================================================
// UTILITIES
// =====================================================

function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString();
}

function getStatusClass(status) {
  return String(status || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

async function logout() {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    console.error("Logout error:", error);
    alert("Unable to log out: " + error.message);
    return;
  }

  sessionStorage.clear();
  window.location.href = "login.html";
}

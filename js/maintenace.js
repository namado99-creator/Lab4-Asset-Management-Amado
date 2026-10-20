
/* =====================================================
   MAINTENANCE MANAGEMENT
   Laboratory Asset Management System
   Uses the shared Supabase client from js/supabase.js
===================================================== */

const supabaseClient = window.supabaseClient;

let currentUser = null;
let currentProfile = null;
let maintenanceRecords = [];
let equipmentMap = {};
let profileMap = {};

// -----------------------------------------------------
// INITIALIZATION
// -----------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
    if (!supabaseClient) {
        console.error("Supabase client is missing. Check js/supabase.js.");
        showMessage("Supabase connection is not configured.", "error");
        return;
    }

    document
        .getElementById("maintenanceForm")
        ?.addEventListener("submit", submitMaintenance);

    document
        .getElementById("searchInput")
        ?.addEventListener("input", renderMaintenanceRecords);

    document
        .getElementById("statusFilter")
        ?.addEventListener("change", renderMaintenanceRecords);

    document
        .getElementById("closeDetailsBtn")
        ?.addEventListener("click", closeMaintenanceDetails);

    document
        .getElementById("cancelMaintenanceBtn")
        ?.addEventListener("click", resetMaintenanceForm);

    document
        .getElementById("logoutBtn")
        ?.addEventListener("click", logout);

    await checkAuthentication();
});

// -----------------------------------------------------
// ROLE HELPERS
// -----------------------------------------------------
function normalizeRole(role) {
    return String(role || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
}

function getCurrentRole() {
    return normalizeRole(currentProfile?.role);
}

function isAdmin() {
    return getCurrentRole() === "administrator";
}

function isStaff() {
    return ["staff", "laboratory_staff"].includes(getCurrentRole());
}

function canManageMaintenance() {
    return isAdmin() || isStaff();
}

function formatRole(role) {
    const normalized = normalizeRole(role);

    if (normalized === "administrator") return "Administrator";

    if (["staff", "laboratory_staff"].includes(normalized)) {
        return "Laboratory Staff";
    }

    if (["requester", "viewer"].includes(normalized)) {
        return "Requester / Viewer";
    }

    return role || "Unknown Role";
}

// -----------------------------------------------------
// AUTHENTICATION
// -----------------------------------------------------
async function checkAuthentication() {
    const { data: { user }, error } =
        await supabaseClient.auth.getUser();

    if (error || !user) {
        window.location.replace("login.html");
        return;
    }

    currentUser = user;

    const { data: profile, error: profileError } =
        await supabaseClient
            .from("profiles")
            .select("id, full_name, role")
            .eq("id", user.id)
            .maybeSingle();

    if (profileError || !profile) {
        console.error("Profile loading error:", profileError);
        showMessage("Unable to load your user profile.", "error");
        return;
    }

    currentProfile = profile;

    const nameElement = document.getElementById("userName");
    const roleElement = document.getElementById("userRole");

    if (nameElement) {
        nameElement.textContent = profile.full_name || user.email || "User";
    }

    if (roleElement) {
        roleElement.textContent = formatRole(profile.role);
    }

    // Only administrators and laboratory staff may submit
    // and update maintenance requests on this page.
    const formSection =
        document.getElementById("maintenanceFormSection");

    if (formSection) {
        formSection.style.display =
            canManageMaintenance() ? "" : "none";
    }

    await loadEquipment();
    await loadMaintenanceRecords();
}

// -----------------------------------------------------
// LOAD EQUIPMENT
// -----------------------------------------------------
async function loadEquipment() {
    const select = document.getElementById("equipmentId");

    if (!select) return;

    const previousValue = select.value;

    const { data, error } = await supabaseClient
        .from("equipment")
        .select("id, equipment_code, equipment_name, status")
        .order("equipment_code", { ascending: true });

    if (error) {
        console.error("Equipment loading error:", error);
        showMessage("Unable to load equipment: " + error.message, "error");
        return;
    }

    select.innerHTML = '<option value="">Select equipment</option>';

    (data || []).forEach(equipment => {
        const option = document.createElement("option");

        option.value = equipment.id;
        option.textContent =
            `${equipment.equipment_code || "No code"} - ` +
            `${equipment.equipment_name || "Unnamed equipment"} ` +
            `(${equipment.status || "Unknown status"})`;

        // Do not submit maintenance for equipment that is
        // already borrowed or already under maintenance.
        const status = String(equipment.status || "").toLowerCase();

        option.disabled =
            status === "borrowed" || status === "maintenance";

        select.appendChild(option);
    });

    if (
        previousValue &&
        [...select.options].some(option =>
            option.value === previousValue && !option.disabled
        )
    ) {
        select.value = previousValue;
    }
}

// -----------------------------------------------------
// LOAD MAINTENANCE RECORDS
// -----------------------------------------------------
async function loadMaintenanceRecords() {
    const tbody = document.getElementById("maintenanceTableBody");

    if (tbody) {
        tbody.innerHTML =
            '<tr><td colspan="8">Loading maintenance records...</td></tr>';
    }

    const { data, error } = await supabaseClient
        .from("maintenance_requests")
        .select(`
            id,
            equipment_id,
            requester_id,
            issue_description,
            priority,
            status,
            created_at,
            resolved_at
        `)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Maintenance loading error:", error);

        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8">
                        Unable to load records. Check the
                        maintenance_requests table and its RLS policies.
                    </td>
                </tr>
            `;
        }

        showMessage(
            "Unable to load maintenance records: " + error.message,
            "error"
        );
        return;
    }

    maintenanceRecords = data || [];

    await loadRelatedRecords();
    renderMaintenanceRecords();
}

// -----------------------------------------------------
// LOAD RELATED EQUIPMENT AND REQUESTER NAMES
// -----------------------------------------------------
async function loadRelatedRecords() {
    equipmentMap = {};
    profileMap = {};

    const equipmentIds = [
        ...new Set(
            maintenanceRecords
                .map(record => record.equipment_id)
                .filter(id => id !== null && id !== undefined)
        )
    ];

    const requesterIds = [
        ...new Set(
            maintenanceRecords
                .map(record => record.requester_id)
                .filter(Boolean)
        )
    ];

    if (equipmentIds.length) {
        const { data, error } = await supabaseClient
            .from("equipment")
            .select("id, equipment_code, equipment_name, status")
            .in("id", equipmentIds);

        if (error) {
            console.error("Related equipment loading error:", error);
        } else {
            (data || []).forEach(item => {
                equipmentMap[String(item.id)] = item;
            });
        }
    }

    if (requesterIds.length) {
        const { data, error } = await supabaseClient
            .from("profiles")
            .select("id, full_name")
            .in("id", requesterIds);

        if (error) {
            console.error("Requester loading error:", error);
        } else {
            (data || []).forEach(item => {
                profileMap[item.id] = item;
            });
        }
    }
}

// -----------------------------------------------------
// FILTER AND RENDER RECORDS
// -----------------------------------------------------
function renderMaintenanceRecords() {
    const tbody = document.getElementById("maintenanceTableBody");
    if (!tbody) return;

    const searchTerm = (
        document.getElementById("searchInput")?.value || ""
    ).trim().toLowerCase();

    const selectedStatus =
        document.getElementById("statusFilter")?.value || "All";

    const filteredRecords = maintenanceRecords.filter(record => {
        const equipment = equipmentMap[String(record.equipment_id)];
        const requester = profileMap[record.requester_id];

        const searchableText = [
            record.id,
            record.equipment_id,
            equipment?.equipment_code,
            equipment?.equipment_name,
            requester?.full_name,
            record.issue_description,
            record.priority,
            record.status,
            record.created_at
        ].join(" ").toLowerCase();

        const matchesSearch = searchableText.includes(searchTerm);

        const matchesStatus =
            selectedStatus === "All" ||
            record.status === selectedStatus;

        return matchesSearch && matchesStatus;
    });

    const count = document.getElementById("recordCount");

    if (count) {
        count.textContent =
            `${filteredRecords.length} record(s)`;
    }

    if (!filteredRecords.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center;">
                    No matching maintenance records found.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filteredRecords.map(record => {
        const equipment = equipmentMap[String(record.equipment_id)];
        const requester = profileMap[record.requester_id];

        const equipmentName = equipment
            ? `${equipment.equipment_code || ""} - ${equipment.equipment_name || ""}`
            : `Equipment ID ${record.equipment_id ?? "-"}`;

        const requesterName =
            requester?.full_name || "Unknown user";

        return `
            <tr>
                <td>${escapeHTML(record.id)}</td>
                <td>${escapeHTML(equipmentName)}</td>
                <td>${escapeHTML(requesterName)}</td>
                <td>${escapeHTML(record.issue_description || "-")}</td>
                <td>
                    <span class="status ${getPriorityClass(record.priority)}">
                        ${escapeHTML(record.priority || "-")}
                    </span>
                </td>
                <td>
                    <span class="status ${getStatusClass(record.status)}">
                        ${escapeHTML(record.status || "-")}
                    </span>
                </td>
                <td>${escapeHTML(formatDate(record.created_at))}</td>
                <td>${renderActions(record)}</td>
            </tr>
        `;
    }).join("");
}

// -----------------------------------------------------
// ACTION BUTTONS
// -----------------------------------------------------
function renderActions(record) {
    const id = Number(record.id);

    let buttons = `
        <button type="button" class="btn btn-small"
            onclick="viewMaintenance(${id})">
            View
        </button>
    `;

    if (!canManageMaintenance()) {
        return buttons;
    }

    if (record.status === "Pending") {
        buttons += `
            <button type="button" class="btn btn-small"
                onclick="updateMaintenanceStatus(${id}, 'In Progress')">
                Start
            </button>
        `;
    }

    if (record.status === "In Progress") {
        buttons += `
            <button type="button" class="btn btn-small"
                onclick="updateMaintenanceStatus(${id}, 'Completed')">
                Complete
            </button>
        `;
    }

    return buttons;
}

// -----------------------------------------------------
// SUBMIT MAINTENANCE REQUEST
// -----------------------------------------------------
async function submitMaintenance(event) {
    event.preventDefault();

    if (!currentUser || !currentProfile) {
        showMessage("Please sign in again.", "error");
        return;
    }

    if (!canManageMaintenance()) {
        showMessage(
            "You do not have permission to submit maintenance requests.",
            "error"
        );
        return;
    }

    const form = document.getElementById("maintenanceForm");
    const submitButton =
        document.getElementById("submitMaintenanceBtn");

    const equipmentId =
        document.getElementById("equipmentId")?.value;

    const issueDescription =
        document.getElementById("issueDescription")?.value.trim();

    const priority =
        document.getElementById("priority")?.value;

    if (!equipmentId || !issueDescription || !priority) {
        showMessage("Please complete all required fields.", "error");
        return;
    }

    if (issueDescription.length > 5000) {
        showMessage("The issue description is too long.", "error");
        return;
    }

    if (submitButton) submitButton.disabled = true;

    try {
        const { data: equipment, error: equipmentError } =
            await supabaseClient
                .from("equipment")
                .select("id, status")
                .eq("id", equipmentId)
                .maybeSingle();

        if (equipmentError || !equipment) {
            showMessage("Selected equipment could not be found.", "error");
            return;
        }

        const currentStatus =
            String(equipment.status || "").toLowerCase();

        if (["borrowed", "maintenance"].includes(currentStatus)) {
            showMessage(
                "This equipment is borrowed or already under maintenance.",
                "error"
            );
            await loadEquipment();
            return;
        }

        const { data: newRecord, error: insertError } =
            await supabaseClient
                .from("maintenance_requests")
                .insert({
                    equipment_id: Number(equipmentId),
                    requester_id: currentUser.id,
                    issue_description: issueDescription,
                    priority,
                    status: "Pending"
                })
                .select()
                .single();

        if (insertError) {
            console.error("Maintenance insert error:", insertError);
            showMessage(
                "Failed to submit request: " + insertError.message,
                "error"
            );
            return;
        }

        // Mark equipment as unavailable while it is under maintenance.
        const { error: updateEquipmentError } =
            await supabaseClient
                .from("equipment")
                .update({ status: "Maintenance" })
                .eq("id", equipmentId);

        if (updateEquipmentError) {
            console.error(
                "Equipment status update error:",
                updateEquipmentError
            );

            showMessage(
                "Request was saved, but equipment status could not be updated. " +
                "Please check the equipment record.",
                "error"
            );
        } else {
            showMessage("Maintenance request submitted successfully.", "success");
        }

        await createAuditLog(
            "CREATE",
            "Maintenance",
            newRecord.id,
            `Created maintenance request for equipment ID ${equipmentId}`
        );

        form?.reset();
        await loadEquipment();
        await loadMaintenanceRecords();
    } catch (error) {
        console.error("Unexpected submission error:", error);
        showMessage("An unexpected error occurred.", "error");
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
}

// -----------------------------------------------------
// UPDATE MAINTENANCE STATUS
// -----------------------------------------------------
async function updateMaintenanceStatus(id, newStatus) {
    if (!canManageMaintenance()) {
        showMessage(
            "You do not have permission to update maintenance records.",
            "error"
        );
        return;
    }

    const allowedTransitions = {
        "Pending": ["In Progress"],
        "In Progress": ["Completed"]
    };

    const record = maintenanceRecords.find(
        item => String(item.id) === String(id)
    );

    if (!record) {
        showMessage("Maintenance record not found.", "error");
        return;
    }

    if (!(allowedTransitions[record.status] || []).includes(newStatus)) {
        showMessage(
            `Cannot change status from ${record.status} to ${newStatus}.`,
            "error"
        );
        return;
    }

    const updateData = { status: newStatus };

    if (newStatus === "Completed") {
        updateData.resolved_at = new Date().toISOString();
    }

    const { error: requestError } = await supabaseClient
        .from("maintenance_requests")
        .update(updateData)
        .eq("id", id)
        .eq("status", record.status);

    if (requestError) {
        console.error("Maintenance status update error:", requestError);
        showMessage(
            "Failed to update maintenance request: " + requestError.message,
            "error"
        );
        return;
    }

    if (newStatus === "Completed") {
        // Only set Available if the equipment is still marked Maintenance.
        // Review damaged equipment manually before making it available.
        const { data: equipment, error: equipmentReadError } =
            await supabaseClient
                .from("equipment")
                .select("id, status")
                .eq("id", record.equipment_id)
                .maybeSingle();

        if (equipmentReadError) {
            console.error(equipmentReadError);
            showMessage(
                "Request completed, but equipment status needs checking.",
                "error"
            );
        } else if (
            equipment &&
            String(equipment.status || "").toLowerCase() === "maintenance"
        ) {
            const { error: equipmentUpdateError } =
                await supabaseClient
                    .from("equipment")
                    .update({ status: "Available" })
                    .eq("id", record.equipment_id)
                    .eq("status", "Maintenance");

            if (equipmentUpdateError) {
                console.error(equipmentUpdateError);
                showMessage(
                    "Request completed, but equipment status could not be updated.",
                    "error"
                );
            }
        }
    }

    await createAuditLog(
        "UPDATE",
        "Maintenance",
        record.id,
        `Maintenance status changed from ${record.status} to ${newStatus}`
    );

    await loadEquipment();
    await loadMaintenanceRecords();

    showMessage(
        `Maintenance request marked as ${newStatus}.`,
        "success"
    );
}

// -----------------------------------------------------
// VIEW DETAILS
// -----------------------------------------------------
function viewMaintenance(id) {
    const record = maintenanceRecords.find(
        item => String(item.id) === String(id)
    );

    if (!record) {
        showMessage("Maintenance record not found.", "error");
        return;
    }

    const equipment = equipmentMap[String(record.equipment_id)];
    const requester = profileMap[record.requester_id];

    const details = document.getElementById("maintenanceDetails");
    const section = document.getElementById("maintenanceDetailsSection");

    if (!details || !section) return;

    details.innerHTML = `
        <p><strong>Request ID:</strong> ${escapeHTML(record.id)}</p>
        <p><strong>Equipment:</strong> ${
            escapeHTML(
                equipment
                    ? `${equipment.equipment_code || ""} - ${equipment.equipment_name || ""}`
                    : `Equipment ID ${record.equipment_id ?? "-"}`
            )
        }</p>
        <p><strong>Requester:</strong> ${
            escapeHTML(requester?.full_name || "Unknown user")
        }</p>
        <p><strong>Issue:</strong> ${
            escapeHTML(record.issue_description || "-")
        }</p>
        <p><strong>Priority:</strong> ${
            escapeHTML(record.priority || "-")
        }</p>
        <p><strong>Status:</strong> ${
            escapeHTML(record.status || "-")
        }</p>
        <p><strong>Created:</strong> ${
            escapeHTML(formatDate(record.created_at))
        }</p>
        <p><strong>Resolved:</strong> ${
            escapeHTML(
                record.resolved_at
                    ? formatDate(record.resolved_at)
                    : "Not yet resolved"
            )
        }</p>
    `;

    section.classList.remove("hidden");
    section.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeMaintenanceDetails() {
    document
        .getElementById("maintenanceDetailsSection")
        ?.classList.add("hidden");
}

// -----------------------------------------------------
// RESET FORM
// -----------------------------------------------------
function resetMaintenanceForm() {
    document.getElementById("maintenanceForm")?.reset();

    const message = document.getElementById("maintenanceMessage");

    if (message) {
        message.textContent = "";
        message.className = "";
        message.style.display = "none";
    }
}

// -----------------------------------------------------
// AUDIT LOG
// -----------------------------------------------------
async function createAuditLog(action, module, recordId, description) {
    if (!currentUser) return;

    const { error } = await supabaseClient
        .from("audit_logs")
        .insert({
            user_id: currentUser.id,
            action,
            module,
            record_id: Number(recordId),
            description
        });

    if (error) {
        // A failed audit insert should be investigated in Supabase.
        console.error("Audit log error:", error);
    }
}

// -----------------------------------------------------
// LOGOUT
// -----------------------------------------------------
async function logout() {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
        console.error("Logout error:", error);
        showMessage("Unable to log out. Please try again.", "error");
        return;
    }

    sessionStorage.clear();
    window.location.replace("login.html");
}

// -----------------------------------------------------
// HELPERS
// -----------------------------------------------------
function formatDate(date) {
    if (!date) return "-";

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) return "-";

    return parsedDate.toLocaleString();
}

function getStatusClass(status) {
    if (status === "Pending") return "status-pending";
    if (status === "In Progress") return "status-approved";
    if (status === "Completed") return "status-returned";
    if (status === "Cancelled") return "status-rejected";

    return "";
}

function getPriorityClass(priority) {
    if (priority === "High") return "status-rejected";
    if (priority === "Medium") return "status-pending";
    if (priority === "Low") return "status-approved";

    return "";
}

function escapeHTML(value) {
    if (value === null || value === undefined) return "";

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showMessage(message, type = "success") {
    const element = document.getElementById("maintenanceMessage");

    if (!element) {
        console.log(message);
        return;
    }

    element.textContent = message;
    element.className = `message ${type}`;
    element.style.display = "block";
}

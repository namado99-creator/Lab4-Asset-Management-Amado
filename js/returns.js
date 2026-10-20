
/* =====================================================
   RETURNS MANAGEMENT
   Laboratory Asset Management System
   Uses the shared client from js/supabase.js
   ===================================================== */

let currentUser = null;
let currentProfile = null;
let returnRecords = [];
let equipmentMap = {};
let requesterMap = {};

document.addEventListener("DOMContentLoaded", initializeReturnsPage);

// -----------------------------------------------------
// INITIALIZE
// -----------------------------------------------------
async function initializeReturnsPage() {
    try {
        if (!window.supabaseClient) {
            throw new Error(
                "Supabase client not found. Check js/supabase.js and script order."
            );
        }

        const { data, error } =
            await window.supabaseClient.auth.getUser();

        if (error) throw error;

        if (!data?.user) {
            window.location.href = "login.html";
            return;
        }

        currentUser = data.user;

        const { data: profile, error: profileError } =
            await window.supabaseClient
                .from("profiles")
                .select("id, full_name, role")
                .eq("id", currentUser.id)
                .maybeSingle();

        if (profileError) throw profileError;

        if (!profile) {
            showMessage(
                "No profile was found for this account. Contact the administrator.",
                "error"
            );
            return;
        }

        currentProfile = profile;

        const role = normalizeRole(profile.role);

        sessionStorage.setItem("userId", currentUser.id);
        sessionStorage.setItem("userName", profile.full_name || "");
        sessionStorage.setItem("userRole", role);
        sessionStorage.setItem("userEmail", currentUser.email || "");

        setupUserInterface(role);
        setupEventListeners();

        await loadReturnRecords();

    } catch (error) {
        console.error("Returns initialization error:", error);
        showMessage(
            `Unable to initialize Returns: ${error.message || "Unknown error"}`,
            "error"
        );
    }
}

// -----------------------------------------------------
// ROLE NORMALIZATION
// -----------------------------------------------------
function normalizeRole(role) {
    const value = String(role || "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");

    if (["admin", "administrator"].includes(value)) {
        return "administrator";
    }

    if ([
        "staff",
        "laboratory_staff",
        "lab_staff"
    ].includes(value)) {
        return "staff";
    }

    if ([
        "requester",
        "viewer",
        "requester_viewer"
    ].includes(value)) {
        return "requester";
    }

    return value;
}

function formatRole(role) {
    const normalized = normalizeRole(role);

    if (normalized === "administrator") return "Administrator";
    if (normalized === "staff") return "Laboratory Staff";
    if (normalized === "requester") return "Requester / Viewer";

    return role || "Unknown role";
}

// -----------------------------------------------------
// USER INTERFACE
// -----------------------------------------------------
function setupUserInterface(role) {
    const userName = document.getElementById("userName");
    const userRole = document.getElementById("userRole");

    if (userName) {
        userName.textContent =
            currentProfile.full_name || currentUser.email || "User";
    }

    if (userRole) {
        userRole.textContent = formatRole(role);
    }

    document.querySelectorAll("[data-access]").forEach(element => {
        const allowedRoles = element
            .getAttribute("data-access")
            .split(/\s+/)
            .map(normalizeRole);

        element.style.display =
            allowedRoles.includes(role) ? "" : "none";
    });

    // Only administrators and laboratory staff may use this page.
    if (!["administrator", "staff"].includes(role)) {
        showMessage(
            "You do not have permission to access Returns.",
            "error"
        );

        setTimeout(() => {
            window.location.href = "dashboard.html";
        }, 1500);
    }
}

function setupEventListeners() {
    document.getElementById("logoutBtn")
        ?.addEventListener("click", logout);

    document.getElementById("searchInput")
        ?.addEventListener("input", renderReturnRecords);

    document.getElementById("statusFilter")
        ?.addEventListener("change", renderReturnRecords);

    document.getElementById("closeDetailsBtn")
        ?.addEventListener("click", () => {
            const section =
                document.getElementById("returnDetailsSection");

            section?.classList.add("hidden");
        });
}

// -----------------------------------------------------
// LOAD REQUESTS
// The Returns page shows Released requests that can be
// returned and Returned requests for history.
// -----------------------------------------------------
async function loadReturnRecords() {
    const tbody = document.getElementById("returnsTableBody");
    const count = document.getElementById("recordCount");

    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="loading-state">
                    Loading return records...
                </td>
            </tr>
        `;
    }

    const { data, error } = await window.supabaseClient
        .from("borrowing_requests")
        .select(`
            id,
            equipment_id,
            requester_id,
            quantity,
            purpose,
            request_date,
            status,
            released_at,
            returned_at,
            created_at
        `)
        .in("status", ["Released", "Returned", "Closed"])
        .order("released_at", { ascending: false, nullsFirst: false });

    if (error) {
        console.error("Return records query error:", error);

        if (count) count.textContent = "Error";

        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8">
                        <strong>Unable to load return records.</strong>
                        <br>
                        <small>${escapeHTML(error.message)}</small>
                    </td>
                </tr>
            `;
        }
        return;
    }

    returnRecords = data || [];

    await loadRelatedData();
    renderReturnRecords();
}

// -----------------------------------------------------
// LOAD EQUIPMENT AND REQUESTER DETAILS
// -----------------------------------------------------
async function loadRelatedData() {
    equipmentMap = {};
    requesterMap = {};

    const equipmentIds = [
        ...new Set(
            returnRecords
                .map(record => record.equipment_id)
                .filter(id => id !== null && id !== undefined)
        )
    ];

    const requesterIds = [
        ...new Set(
            returnRecords
                .map(record => record.requester_id)
                .filter(Boolean)
        )
    ];

    if (equipmentIds.length) {
        const { data, error } = await window.supabaseClient
            .from("equipment")
            .select("id, equipment_code, equipment_name, status")
            .in("id", equipmentIds);

        if (error) {
            console.error("Equipment lookup error:", error);
        } else {
            (data || []).forEach(item => {
                equipmentMap[item.id] = item;
            });
        }
    }

    if (requesterIds.length) {
        const { data, error } = await window.supabaseClient
            .from("profiles")
            .select("id, full_name")
            .in("id", requesterIds);

        if (error) {
            console.error("Requester lookup error:", error);
        } else {
            (data || []).forEach(item => {
                requesterMap[item.id] = item;
            });
        }
    }
}

// -----------------------------------------------------
// RENDER RECORDS + SEARCH + STATUS FILTER
// -----------------------------------------------------
function renderReturnRecords() {
    const tbody = document.getElementById("returnsTableBody");
    const count = document.getElementById("recordCount");

    if (!tbody) return;

    const search = (
        document.getElementById("searchInput")?.value || ""
    ).trim().toLowerCase();

    const selectedStatus =
        document.getElementById("statusFilter")?.value || "All";

    const filtered = returnRecords.filter(record => {
        const equipment = equipmentMap[record.equipment_id];
        const requester = requesterMap[record.requester_id];

        const searchable = [
            record.id,
            equipment?.equipment_code,
            equipment?.equipment_name,
            requester?.full_name,
            record.purpose,
            record.status
        ].filter(value => value !== null && value !== undefined)
            .join(" ")
            .toLowerCase();

        const matchesSearch = searchable.includes(search);
        const matchesStatus =
            selectedStatus === "All" ||
            record.status === selectedStatus;

        return matchesSearch && matchesStatus;
    });

    if (count) {
        count.textContent =
            `${filtered.length} record${filtered.length === 1 ? "" : "s"}`;
    }

    if (!filtered.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center;">
                    No return records match your search or status filter.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = "";

    filtered.forEach(record => {
        const equipment = equipmentMap[record.equipment_id];
        const requester = requesterMap[record.requester_id];

        const row = document.createElement("tr");

        const equipmentName = equipment
            ? `${equipment.equipment_code || ""} - ${equipment.equipment_name || ""}`
            : `Equipment #${record.equipment_id}`;

        const actionButtons = [
            `<button type="button" class="btn btn-small" data-action="view" data-id="${record.id}">View</button>`,
            record.status === "Released"
                ? `<button type="button" class="btn btn-small" data-action="return" data-id="${record.id}">Process Return</button>`
                : ""
        ].join(" ");

        row.innerHTML = `
            <td>${escapeHTML(record.id)}</td>
            <td>${escapeHTML(equipmentName)}</td>
            <td>${escapeHTML(requester?.full_name || "Requester details unavailable")}</td>
            <td>${escapeHTML(record.quantity)}</td>
            <td>${escapeHTML(record.purpose || "-")}</td>
            <td>${formatDate(record.released_at)}</td>
            <td>
                <span class="status status-${escapeHTML(
                    String(record.status || "").toLowerCase()
                )}">
                    ${escapeHTML(record.status || "Unknown")}
                </span>
            </td>
            <td>${actionButtons}</td>
        `;

        tbody.appendChild(row);
    });

    tbody.querySelectorAll("[data-action]").forEach(button => {
        button.addEventListener("click", () => {
            const id = Number(button.dataset.id);

            if (button.dataset.action === "view") {
                viewReturn(id);
            } else if (button.dataset.action === "return") {
                processReturn(id);
            }
        });
    });
}

// -----------------------------------------------------
// PROCESS RETURN
// Note: two separate table updates are not fully atomic.
// For strict consistency, use a Supabase database RPC
// transaction and enforce permissions through RLS.
// -----------------------------------------------------
async function processReturn(id) {
    const role = normalizeRole(currentProfile?.role);

    if (!["administrator", "staff"].includes(role)) {
        showMessage(
            "Only Administrator and Laboratory Staff may process returns.",
            "error"
        );
        return;
    }

    const record = returnRecords.find(item => Number(item.id) === Number(id));

    if (!record || record.status !== "Released") {
        showMessage(
            "This request is not awaiting return, or it was already processed.",
            "error"
        );
        return;
    }

    const equipment = equipmentMap[record.equipment_id];

    if (!equipment) {
        showMessage(
            "Equipment information is unavailable. Refresh and try again.",
            "error"
        );
        return;
    }

    if (!confirm(`Process the return for request #${id}?`)) {
        return;
    }

    // Update request only if it is still Released.
    const { data: updatedRequest, error: requestError } =
        await window.supabaseClient
            .from("borrowing_requests")
            .update({
                status: "Returned",
                returned_at: new Date().toISOString()
            })
            .eq("id", id)
            .eq("status", "Released")
            .select("id")
            .maybeSingle();

    if (requestError) {
        console.error("Return update error:", requestError);
        showMessage(
            `Unable to process return: ${requestError.message}`,
            "error"
        );
        return;
    }

    if (!updatedRequest) {
        showMessage(
            "This request was already processed or you do not have permission.",
            "error"
        );
        await loadReturnRecords();
        return;
    }

    // Preserve damaged/maintenance states instead of blindly
    // marking every item Available.
    const oldStatus = equipment.status;
    const newStatus = ["Damaged", "Maintenance"].includes(oldStatus)
        ? oldStatus
        : "Available";

    const { error: equipmentError } = await window.supabaseClient
        .from("equipment")
        .update({ status: newStatus })
        .eq("id", record.equipment_id);

    if (equipmentError) {
        console.error("Equipment status update error:", equipmentError);
        showMessage(
            "The request was marked Returned, but the equipment status could not be updated. Contact the administrator.",
            "error"
        );
        await loadReturnRecords();
        return;
    }

    await createAuditLog(
        "RETURN",
        "Borrowing Requests",
        id,
        `Returned equipment ${equipment.equipment_code || record.equipment_id} for request #${id}`
    );

    showMessage("Equipment return processed successfully.", "success");
    await loadReturnRecords();
}

// -----------------------------------------------------
// VIEW DETAILS
// -----------------------------------------------------
function viewReturn(id) {
    const record = returnRecords.find(item => Number(item.id) === Number(id));

    if (!record) {
        showMessage("Return record not found.", "error");
        return;
    }

    const equipment = equipmentMap[record.equipment_id];
    const requester = requesterMap[record.requester_id];

    const details = document.getElementById("returnDetails");
    const section = document.getElementById("returnDetailsSection");

    if (!details || !section) return;

    details.innerHTML = `
        <p><strong>Request ID:</strong> ${escapeHTML(record.id)}</p>
        <p><strong>Equipment:</strong> ${escapeHTML(
            equipment
                ? `${equipment.equipment_code || ""} - ${equipment.equipment_name || ""}`
                : `Equipment #${record.equipment_id}`
        )}</p>
        <p><strong>Requester:</strong> ${escapeHTML(
            requester?.full_name || "Requester details unavailable"
        )}</p>
        <p><strong>Quantity:</strong> ${escapeHTML(record.quantity)}</p>
        <p><strong>Purpose:</strong> ${escapeHTML(record.purpose || "-")}</p>
        <p><strong>Status:</strong> ${escapeHTML(record.status)}</p>
        <p><strong>Released:</strong> ${formatDate(record.released_at)}</p>
        <p><strong>Returned:</strong> ${formatDate(record.returned_at)}</p>
    `;

    section.classList.remove("hidden");
    section.scrollIntoView({ behavior: "smooth", block: "start" });
}

// -----------------------------------------------------
// AUDIT LOG
// -----------------------------------------------------
async function createAuditLog(action, module, recordId, description) {
    const { error } = await window.supabaseClient
        .from("audit_logs")
        .insert({
            user_id: currentUser.id,
            action,
            module,
            record_id: recordId,
            description
        });

    if (error) {
        // A failed audit insert should be visible in the console.
        // RLS must permit authenticated users to insert their own logs.
        console.error("Audit log insert failed:", error);
    }
}

// -----------------------------------------------------
// LOGOUT
// -----------------------------------------------------
async function logout() {
    const { error } = await window.supabaseClient.auth.signOut();

    if (error) {
        console.error("Logout error:", error);
        showMessage(`Unable to log out: ${error.message}`, "error");
        return;
    }

    sessionStorage.clear();
    window.location.href = "login.html";
}

// -----------------------------------------------------
// HELPERS
// -----------------------------------------------------
function formatDate(value) {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleString();
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
    const element = document.getElementById("returnMessage");

    if (!element) {
        alert(message);
        return;
    }

    element.textContent = message;
    element.className = `message ${type}`;
    element.style.display = "block";

    if (element._hideTimer) {
        clearTimeout(element._hideTimer);
    }

    element._hideTimer = setTimeout(() => {
        element.style.display = "none";
    }, 5000);
}

// =====================================================
// MAINTENANCE MANAGEMENT
// Laboratory Asset Management System
// =====================================================

const { createClient } = supabase;
const supabaseClient = createClient(
    "https://ddxurmzmepkbgulbawiw.supabase.co",
    "YOUR_SUPABASE_ANON_KEY"
);

let currentUser = null;
let currentProfile = null;
let maintenanceRecords = [];

// -----------------------------------------------------
// INITIALIZATION
// -----------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
    await checkAuthentication();
});

// -----------------------------------------------------
// AUTHENTICATION
// -----------------------------------------------------
async function checkAuthentication() {
    const {
        data: { user },
        error
    } = await supabaseClient.auth.getUser();

    if (error || !user) {
        window.location.href = "login.html";
        return;
    }

    currentUser = user;

    const { data: profile, error: profileError } = await supabaseClient
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", user.id)
        .maybeSingle();

    if (profileError || !profile) {
        await supabaseClient.auth.signOut();
        window.location.href = "login.html";
        return;
    }

    currentProfile = profile;

    sessionStorage.setItem("userId", user.id);
    sessionStorage.setItem("userName", profile.full_name);
    sessionStorage.setItem("userRole", profile.role);
    sessionStorage.setItem("userEmail", user.email);

    setupUserInterface();
    await loadEquipment();
    await loadMaintenanceRecords();
}

// -----------------------------------------------------
// USER INTERFACE
// -----------------------------------------------------
function setupUserInterface() {
    const userName = document.getElementById("userName");
    const userRole = document.getElementById("userRole");

    if (userName) {
        userName.textContent = currentProfile.full_name;
    }

    if (userRole) {
        userRole.textContent = formatRole(currentProfile.role);
    }

    document.querySelectorAll("[data-access]").forEach(element => {
        const allowedRoles = element.dataset.access
            .split(/\s+/)
            .map(role => role.toLowerCase());

        const currentRole = currentProfile.role.toLowerCase();

        if (!allowedRoles.includes(currentRole)) {
            element.style.display = "none";
        }
    });

    const formSection = document.getElementById("maintenanceFormSection");

    if (formSection) {
        if (
            currentProfile.role === "administrator" ||
            currentProfile.role === "staff"
        ) {
            formSection.style.display = "block";
        } else {
            formSection.style.display = "none";
        }
    }

    const logoutButton = document.getElementById("logoutBtn");

    if (logoutButton) {
        logoutButton.addEventListener("click", logout);
    }
}

function formatRole(role) {
    if (role === "administrator") return "Administrator";
    if (role === "staff") return "Laboratory Staff";
    if (role === "requester") return "Requester / Viewer";

    return role;
}

// -----------------------------------------------------
// LOAD EQUIPMENT
// -----------------------------------------------------
async function loadEquipment() {
    const equipmentSelect = document.getElementById("equipmentId");

    if (!equipmentSelect) return;

    const { data, error } = await supabaseClient
        .from("equipment")
        .select("id, equipment_code, equipment_name, status")
        .order("equipment_code");

    if (error) {
        console.error("Equipment loading error:", error);
        showMessage("Unable to load equipment.", "error");
        return;
    }

    equipmentSelect.innerHTML =
        '<option value="">Select equipment</option>';

    data.forEach(equipment => {
        const option = document.createElement("option");

        option.value = equipment.id;

        option.textContent =
            `${equipment.equipment_code} - ${equipment.equipment_name} (${equipment.status})`;

        equipmentSelect.appendChild(option);
    });
}

// -----------------------------------------------------
// LOAD MAINTENANCE RECORDS
// -----------------------------------------------------
async function loadMaintenanceRecords() {

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

        showMessage(
            "Unable to load maintenance records. Make sure the maintenance_requests table exists.",
            "error"
        );

        return;
    }

    maintenanceRecords = data || [];

    await renderMaintenanceRecords();
}

// -----------------------------------------------------
// RENDER TABLE
// -----------------------------------------------------
async function renderMaintenanceRecords() {

    const tbody = document.getElementById("maintenanceTableBody");

    if (!tbody) return;

    tbody.innerHTML = "";

    if (maintenanceRecords.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center;">
                    No maintenance records found.
                </td>
            </tr>
        `;

        return;
    }

    const equipmentIds = [
        ...new Set(
            maintenanceRecords
                .map(record => record.equipment_id)
                .filter(Boolean)
        )
    ];

    const requesterIds = [
        ...new Set(
            maintenanceRecords
                .map(record => record.requester_id)
                .filter(Boolean)
        )
    ];

    let equipmentMap = {};
    let profileMap = {};

    if (equipmentIds.length > 0) {

        const { data: equipmentData } = await supabaseClient
            .from("equipment")
            .select("id, equipment_code, equipment_name")
            .in("id", equipmentIds);

        (equipmentData || []).forEach(item => {
            equipmentMap[item.id] = item;
        });
    }

    if (requesterIds.length > 0) {

        const { data: profileData } = await supabaseClient
            .from("profiles")
            .select("id, full_name")
            .in("id", requesterIds);

        (profileData || []).forEach(item => {
            profileMap[item.id] = item;
        });
    }

    maintenanceRecords.forEach(record => {

        const equipment = equipmentMap[record.equipment_id];
        const requester = profileMap[record.requester_id];

        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${escapeHTML(record.id)}</td>

            <td>
                ${equipment
                    ? escapeHTML(
                        `${equipment.equipment_code} - ${equipment.equipment_name}`
                    )
                    : "Unknown equipment"
                }
            </td>

            <td>
                ${requester
                    ? escapeHTML(requester.full_name)
                    : "Unknown user"
                }
            </td>

            <td>
                ${escapeHTML(record.issue_description || "-")}
            </td>

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

            <td>
                ${formatDate(record.created_at)}
            </td>

            <td>
                ${renderActions(record)}
            </td>
        `;

        tbody.appendChild(row);
    });
}

// -----------------------------------------------------
// ACTION BUTTONS
// -----------------------------------------------------
function renderActions(record) {

    if (
        currentProfile.role !== "administrator" &&
        currentProfile.role !== "staff"
    ) {
        return `
            <button
                class="btn btn-small"
                onclick="viewMaintenance(${record.id})">
                View
            </button>
        `;
    }

    let buttons = `
        <button
            class="btn btn-small"
            onclick="viewMaintenance(${record.id})">
            View
        </button>
    `;

    if (record.status === "Pending") {

        buttons += `
            <button
                class="btn btn-small"
                onclick="updateMaintenanceStatus(${record.id}, 'In Progress')">
                Start
            </button>
        `;
    }

    if (record.status === "In Progress") {

        buttons += `
            <button
                class="btn btn-small"
                onclick="updateMaintenanceStatus(${record.id}, 'Resolved')">
                Resolve
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

    if (
        currentProfile.role !== "administrator" &&
        currentProfile.role !== "staff"
    ) {
        showMessage(
            "You do not have permission to submit maintenance requests.",
            "error"
        );

        return;
    }

    const equipmentId =
        document.getElementById("equipmentId")?.value;

    const issueDescription =
        document.getElementById("issueDescription")?.value.trim();

    const priority =
        document.getElementById("priority")?.value;

    if (!equipmentId || !issueDescription || !priority) {

        showMessage(
            "Please complete all required fields.",
            "error"
        );

        return;
    }

    const { data: equipment, error: equipmentError } =
        await supabaseClient
            .from("equipment")
            .select("id, status")
            .eq("id", equipmentId)
            .single();

    if (equipmentError || !equipment) {

        showMessage(
            "Selected equipment could not be found.",
            "error"
        );

        return;
    }

    const { data, error } = await supabaseClient
        .from("maintenance_requests")
        .insert([
            {
                equipment_id: Number(equipmentId),
                requester_id: currentUser.id,
                issue_description: issueDescription,
                priority: priority,
                status: "Pending"
            }
        ])
        .select()
        .single();

    if (error) {

        console.error(error);

        showMessage(
            "Failed to submit maintenance request: " + error.message,
            "error"
        );

        return;
    }

    // Change equipment to Maintenance
    const { error: equipmentUpdateError } =
        await supabaseClient
            .from("equipment")
            .update({
                status: "Maintenance"
            })
            .eq("id", equipmentId);

    if (equipmentUpdateError) {
        console.error(equipmentUpdateError);
    }

    await createAuditLog(
        "CREATE",
        "Maintenance",
        data.id,
        `Created maintenance request for equipment ID ${equipmentId}`
    );

    showMessage(
        "Maintenance request submitted successfully.",
        "success"
    );

    document.getElementById("maintenanceForm")?.reset();

    await loadEquipment();
    await loadMaintenanceRecords();
}

// -----------------------------------------------------
// UPDATE MAINTENANCE STATUS
// -----------------------------------------------------
async function updateMaintenanceStatus(id, newStatus) {

    if (
        currentProfile.role !== "administrator" &&
        currentProfile.role !== "staff"
    ) {
        showMessage(
            "You do not have permission to update maintenance records.",
            "error"
        );

        return;
    }

    const record =
        maintenanceRecords.find(item => item.id === id);

    if (!record) {
        showMessage("Maintenance record not found.", "error");
        return;
    }

    const updateData = {
        status: newStatus
    };

    if (newStatus === "Resolved") {
        updateData.resolved_at = new Date().toISOString();
    }

    const { error } = await supabaseClient
        .from("maintenance_requests")
        .update(updateData)
        .eq("id", id);

    if (error) {

        console.error(error);

        showMessage(
            "Failed to update maintenance status: " + error.message,
            "error"
        );

        return;
    }

    if (newStatus === "Resolved") {

        const { error: equipmentError } =
            await supabaseClient
                .from("equipment")
                .update({
                    status: "Available"
                })
                .eq("id", record.equipment_id);

        if (equipmentError) {
            console.error(equipmentError);
        }
    }

    await createAuditLog(
        "UPDATE",
        "Maintenance",
        id,
        `Maintenance status changed to ${newStatus}`
    );

    showMessage(
        `Maintenance request marked as ${newStatus}.`,
        "success"
    );

    await loadEquipment();
    await loadMaintenanceRecords();
}

// -----------------------------------------------------
// VIEW DETAILS
// -----------------------------------------------------
function viewMaintenance(id) {

    const record =
        maintenanceRecords.find(item => item.id === id);

    if (!record) {
        showMessage("Maintenance record not found.", "error");
        return;
    }

    const details = document.getElementById("maintenanceDetails");

    if (!details) return;

    details.innerHTML = `
        <h3>Maintenance Details</h3>

        <p>
            <strong>Request ID:</strong>
            ${escapeHTML(record.id)}
        </p>

        <p>
            <strong>Equipment ID:</strong>
            ${escapeHTML(record.equipment_id)}
        </p>

        <p>
            <strong>Requester ID:</strong>
            ${escapeHTML(record.requester_id)}
        </p>

        <p>
            <strong>Issue:</strong>
            ${escapeHTML(record.issue_description)}
        </p>

        <p>
            <strong>Priority:</strong>
            ${escapeHTML(record.priority)}
        </p>

        <p>
            <strong>Status:</strong>
            ${escapeHTML(record.status)}
        </p>

        <p>
            <strong>Created:</strong>
            ${formatDate(record.created_at)}
        </p>

        <p>
            <strong>Resolved:</strong>
            ${record.resolved_at
                ? formatDate(record.resolved_at)
                : "Not yet resolved"
            }
        </p>
    `;

    details.style.display = "block";
}

// -----------------------------------------------------
// AUDIT LOG
// -----------------------------------------------------
async function createAuditLog(
    action,
    module,
    recordId,
    description
) {

    const { error } = await supabaseClient
        .from("audit_logs")
        .insert([
            {
                user_id: currentUser.id,
                action: action,
                module: module,
                record_id: recordId,
                description: description
            }
        ]);

    if (error) {
        console.error("Audit log error:", error);
    }
}

// -----------------------------------------------------
// LOGOUT
// -----------------------------------------------------
async function logout() {

    await supabaseClient.auth.signOut();

    sessionStorage.clear();

    window.location.href = "login.html";
}

// -----------------------------------------------------
// HELPERS
// -----------------------------------------------------
function formatDate(date) {

    if (!date) return "-";

    return new Date(date).toLocaleString();
}

function getStatusClass(status) {

    if (status === "Pending") return "status-pending";
    if (status === "In Progress") return "status-approved";
    if (status === "Resolved") return "status-returned";

    return "";
}

function getPriorityClass(priority) {

    if (priority === "High") return "status-rejected";
    if (priority === "Medium") return "status-pending";
    if (priority === "Low") return "status-approved";

    return "";
}

function escapeHTML(value) {

    if (value === null || value === undefined) {
        return "";
    }

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
        alert(message);
        return;
    }

    element.textContent = message;
    element.className = `message ${type}`;
    element.style.display = "block";

    setTimeout(() => {
        element.style.display = "none";
    }, 4000);
}

// -----------------------------------------------------
// FORM EVENT
// -----------------------------------------------------
const maintenanceForm =
    document.getElementById("maintenanceForm");

if (maintenanceForm) {
    maintenanceForm.addEventListener(
        "submit",
        submitMaintenance
    );
}
// =====================================================
// RETURNS MANAGEMENT
// Laboratory Asset Management System
// =====================================================

const { createClient } = supabase;

const supabaseClient = createClient(
    "https://ddxurmzmepkbgulbawiw.supabase.co",
    "YOUR_SUPABASE_ANON_KEY"
);

let currentUser = null;
let currentProfile = null;
let returnRecords = [];

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

    const { data: profile, error: profileError } =
        await supabaseClient
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

    await loadReturnRecords();
}

// -----------------------------------------------------
// USER INTERFACE
// -----------------------------------------------------
function setupUserInterface() {

    const userName =
        document.getElementById("userName");

    const userRole =
        document.getElementById("userRole");

    if (userName) {
        userName.textContent =
            currentProfile.full_name;
    }

    if (userRole) {
        userRole.textContent =
            formatRole(currentProfile.role);
    }

    document.querySelectorAll("[data-access]")
        .forEach(element => {

            const allowedRoles =
                element.dataset.access
                    .split(/\s+/)
                    .map(role => role.toLowerCase());

            const currentRole =
                currentProfile.role.toLowerCase();

            if (!allowedRoles.includes(currentRole)) {
                element.style.display = "none";
            }
        });

    const logoutButton =
        document.getElementById("logoutBtn");

    if (logoutButton) {
        logoutButton.addEventListener(
            "click",
            logout
        );
    }
}

function formatRole(role) {

    if (role === "administrator") {
        return "Administrator";
    }

    if (role === "staff") {
        return "Laboratory Staff";
    }

    if (role === "requester") {
        return "Requester / Viewer";
    }

    return role;
}

// -----------------------------------------------------
// LOAD RETURNABLE REQUESTS
// -----------------------------------------------------
async function loadReturnRecords() {

    const { data, error } =
        await supabaseClient
            .from("borrowing_requests")
            .select(`
                id,
                equipment_id,
                requester_id,
                quantity,
                purpose,
                request_date,
                status,
                approved_by,
                released_at,
                returned_at,
                created_at
            `)
            .eq("status", "Released")
            .order("released_at", {
                ascending: false
            });

    if (error) {

        console.error(
            "Return records error:",
            error
        );

        showMessage(
            "Unable to load return records.",
            "error"
        );

        return;
    }

    returnRecords = data || [];

    await renderReturnRecords();
}

// -----------------------------------------------------
// RENDER TABLE
// -----------------------------------------------------
async function renderReturnRecords() {

    const tbody =
        document.getElementById("returnsTableBody");

    if (!tbody) return;

    tbody.innerHTML = "";

    if (returnRecords.length === 0) {

        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center;">
                    No equipment currently waiting for return.
                </td>
            </tr>
        `;

        return;
    }

    const equipmentIds = [
        ...new Set(
            returnRecords
                .map(item => item.equipment_id)
                .filter(Boolean)
        )
    ];

    const requesterIds = [
        ...new Set(
            returnRecords
                .map(item => item.requester_id)
                .filter(Boolean)
        )
    ];

    let equipmentMap = {};
    let requesterMap = {};

    // Equipment
    if (equipmentIds.length > 0) {

        const { data: equipmentData } =
            await supabaseClient
                .from("equipment")
                .select(
                    "id, equipment_code, equipment_name, status"
                )
                .in("id", equipmentIds);

        (equipmentData || []).forEach(item => {
            equipmentMap[item.id] = item;
        });
    }

    // Requesters
    if (requesterIds.length > 0) {

        const { data: requesterData } =
            await supabaseClient
                .from("profiles")
                .select("id, full_name")
                .in("id", requesterIds);

        (requesterData || []).forEach(item => {
            requesterMap[item.id] = item;
        });
    }

    returnRecords.forEach(record => {

        const equipment =
            equipmentMap[record.equipment_id];

        const requester =
            requesterMap[record.requester_id];

        const row =
            document.createElement("tr");

        row.innerHTML = `
            <td>
                ${escapeHTML(record.id)}
            </td>

            <td>
                ${
                    equipment
                        ? escapeHTML(
                            `${equipment.equipment_code} - ${equipment.equipment_name}`
                        )
                        : "Unknown equipment"
                }
            </td>

            <td>
                ${
                    requester
                        ? escapeHTML(
                            requester.full_name
                        )
                        : "Unknown requester"
                }
            </td>

            <td>
                ${escapeHTML(record.quantity)}
            </td>

            <td>
                ${escapeHTML(record.purpose)}
            </td>

            <td>
                ${formatDate(record.released_at)}
            </td>

            <td>
                <span class="status status-approved">
                    Released
                </span>
            </td>

            <td>
                ${renderReturnActions(record)}
            </td>
        `;

        tbody.appendChild(row);
    });
}

// -----------------------------------------------------
// RETURN ACTION
// -----------------------------------------------------
function renderReturnActions(record) {

    if (
        currentProfile.role !== "administrator" &&
        currentProfile.role !== "staff"
    ) {
        return `
            <button
                class="btn btn-small"
                onclick="viewReturn(${record.id})">
                View
            </button>
        `;
    }

    return `
        <button
            class="btn btn-small"
            onclick="viewReturn(${record.id})">
            View
        </button>

        <button
            class="btn btn-small"
            onclick="processReturn(${record.id})">
            Return
        </button>
    `;
}

// -----------------------------------------------------
// PROCESS RETURN
// -----------------------------------------------------
async function processReturn(id) {

    if (
        currentProfile.role !== "administrator" &&
        currentProfile.role !== "staff"
    ) {
        showMessage(
            "You do not have permission to process returns.",
            "error"
        );

        return;
    }

    const record =
        returnRecords.find(item => item.id === id);

    if (!record) {

        showMessage(
            "Return record not found.",
            "error"
        );

        return;
    }

    if (record.status !== "Released") {

        showMessage(
            "This request has already been processed.",
            "error"
        );

        return;
    }

    // Check current equipment status
    const { data: equipment, error: equipmentError } =
        await supabaseClient
            .from("equipment")
            .select("id, status, quantity")
            .eq("id", record.equipment_id)
            .single();

    if (equipmentError || !equipment) {

        showMessage(
            "Equipment could not be found.",
            "error"
        );

        return;
    }

    // Return request
    const { error: requestError } =
        await supabaseClient
            .from("borrowing_requests")
            .update({
                status: "Returned",
                returned_at: new Date().toISOString()
            })
            .eq("id", id)
            .eq("status", "Released");

    if (requestError) {

        console.error(requestError);

        showMessage(
            "Failed to process return: " +
            requestError.message,
            "error"
        );

        return;
    }

    // Equipment becomes available
    const { error: equipmentUpdateError } =
        await supabaseClient
            .from("equipment")
            .update({
                status: "Available"
            })
            .eq("id", record.equipment_id);

    if (equipmentUpdateError) {

        console.error(
            equipmentUpdateError
        );

        showMessage(
            "Return was recorded, but equipment status could not be updated.",
            "error"
        );

        await loadReturnRecords();

        return;
    }

    await createAuditLog(
        "RETURN",
        "Borrowing",
        id,
        `Equipment ID ${record.equipment_id} returned successfully`
    );

    showMessage(
        "Equipment returned successfully.",
        "success"
    );

    await loadReturnRecords();
}

// -----------------------------------------------------
// VIEW RETURN DETAILS
// -----------------------------------------------------
function viewReturn(id) {

    const record =
        returnRecords.find(item => item.id === id);

    if (!record) {
        showMessage(
            "Return record not found.",
            "error"
        );

        return;
    }

    const details =
        document.getElementById("returnDetails");

    if (!details) return;

    details.innerHTML = `
        <h3>Return Details</h3>

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
            <strong>Quantity:</strong>
            ${escapeHTML(record.quantity)}
        </p>

        <p>
            <strong>Purpose:</strong>
            ${escapeHTML(record.purpose)}
        </p>

        <p>
            <strong>Status:</strong>
            ${escapeHTML(record.status)}
        </p>

        <p>
            <strong>Released:</strong>
            ${formatDate(record.released_at)}
        </p>

        <p>
            <strong>Returned:</strong>
            ${record.returned_at
                ? formatDate(record.returned_at)
                : "Not yet returned"
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

    const { error } =
        await supabaseClient
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
        console.error(
            "Audit log error:",
            error
        );
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

function escapeHTML(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showMessage(
    message,
    type = "success"
) {

    const element =
        document.getElementById("returnMessage");

    if (!element) {
        alert(message);
        return;
    }

    element.textContent = message;

    element.className =
        `message ${type}`;

    element.style.display = "block";

    setTimeout(() => {
        element.style.display = "none";
    }, 4000);
}
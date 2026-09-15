document.addEventListener("DOMContentLoaded", async () => {

    // ==========================================
    // CHECK LOGIN
    // ==========================================

    const {
        data: { user },
        error
    } = await supabaseClient.auth.getUser();

    if (error || !user) {
        window.location.href = "login.html";
        return;
    }


    // ==========================================
    // GET USER PROFILE
    // ==========================================

    const {
        data: profile,
        error: profileError
    } = await supabaseClient
        .from("profiles")
        .select("full_name, role")
        .eq("id", user.id)
        .maybeSingle();


    if (profileError) {

        console.error("Profile error:", profileError);

        alert("Unable to load your profile.");

        await supabaseClient.auth.signOut();

        sessionStorage.clear();

        window.location.href = "login.html";

        return;
    }


    if (!profile) {

        alert("User profile not found.");

        await supabaseClient.auth.signOut();

        sessionStorage.clear();

        window.location.href = "login.html";

        return;
    }


    // ==========================================
    // USER INFORMATION
    // ==========================================

    const name =
        profile.full_name ||
        user.email ||
        "User";

    const role =
        String(profile.role || "")
            .trim()
            .toLowerCase();


    // ==========================================
    // VALIDATE ROLE
    // ==========================================

    const validRoles = [
        "administrator",
        "staff",
        "laboratory_staff",
        "requester",
        "viewer"
    ];

    if (!validRoles.includes(role)) {

        alert("Invalid user role.");

        await supabaseClient.auth.signOut();

        sessionStorage.clear();

        window.location.href = "login.html";

        return;
    }


    // ==========================================
    // SAVE SESSION INFORMATION
    // ==========================================

    sessionStorage.setItem("userId", user.id);
    sessionStorage.setItem("userRole", role);
    sessionStorage.setItem("userName", name);
    sessionStorage.setItem("userEmail", user.email);


    // ==========================================
    // DISPLAY USER INFORMATION
    // ==========================================

    const userNameElement =
        document.getElementById("userName");

    const welcomeNameElement =
        document.getElementById("welcomeName");

    const userRoleElement =
        document.getElementById("userRole");

    if (userNameElement) {
        userNameElement.textContent = name;
    }

    if (welcomeNameElement) {
        welcomeNameElement.textContent = name;
    }

    if (userRoleElement) {
        userRoleElement.textContent =
            formatRole(role);
    }


    // ==========================================
    // DISPLAY ROLE INFORMATION
    // ==========================================

    const roleTitle =
        document.getElementById("roleTitle");

    const roleDescription =
        document.getElementById("roleDescription");

    const accessMessage =
        document.getElementById("accessMessage");


    if (role === "administrator") {

        if (roleTitle) {
            roleTitle.textContent =
                "Administrator";
        }

        if (roleDescription) {
            roleDescription.textContent =
                "You can manage users and equipment, approve or reject borrowing requests, manage maintenance, and view audit logs.";
        }

        if (accessMessage) {
            accessMessage.textContent =
                "You have full administrative access.";
        }

        showAdministratorMenu();
    }


    else if (
        role === "staff" ||
        role === "laboratory_staff"
    ) {

        if (roleTitle) {
            roleTitle.textContent =
                "Laboratory Staff";
        }

        if (roleDescription) {
            roleDescription.textContent =
                "You can view equipment, create borrowing transactions, process returns, and submit maintenance requests.";
        }

        if (accessMessage) {
            accessMessage.textContent =
                "You have laboratory operational access.";
        }

        showStaffMenu();
    }


    else if (
        role === "requester" ||
        role === "viewer"
    ) {

        if (roleTitle) {
            roleTitle.textContent =
                "Requester / Viewer";
        }

        if (roleDescription) {
            roleDescription.textContent =
                "You can view available equipment, submit borrowing requests, and view your own request history.";
        }

        if (accessMessage) {
            accessMessage.textContent =
                "You have requester access.";
        }

        showRequesterMenu();
    }


    // ==========================================
    // LOAD DASHBOARD NUMBERS
    // ==========================================

    await loadDashboardNumbers(role, user.id);


    // ==========================================
    // LOGOUT
    // ==========================================

    const logoutButton =
        document.getElementById("logoutBtn");

    if (logoutButton) {

        logoutButton.addEventListener(
            "click",
            logout
        );

    }

});


// ==========================================
// FORMAT ROLE
// ==========================================

function formatRole(role) {

    if (role === "administrator") {
        return "ADMINISTRATOR";
    }

    if (
        role === "staff" ||
        role === "laboratory_staff"
    ) {
        return "LABORATORY STAFF";
    }

    if (
        role === "requester" ||
        role === "viewer"
    ) {
        return "REQUESTER / VIEWER";
    }

    return role.toUpperCase();
}


// ==========================================
// SHOW / HIDE MENU
// ==========================================

function setMenuVisibility(
    menuId,
    visible
) {

    const menu =
        document.getElementById(menuId);

    if (!menu) {
        return;
    }

    menu.style.display =
        visible ? "block" : "none";
}


// ==========================================
// ADMINISTRATOR MENU
// ==========================================

function showAdministratorMenu() {

    setMenuVisibility(
        "equipmentMenu",
        true
    );

    setMenuVisibility(
        "borrowingMenu",
        true
    );

    setMenuVisibility(
        "returnMenu",
        true
    );

    setMenuVisibility(
        "maintenanceMenu",
        true
    );

    setMenuVisibility(
        "auditMenu",
        true
    );


    // Change menu labels

    const equipmentMenu =
        document.getElementById("equipmentMenu");

    const borrowingMenu =
        document.getElementById("borrowingMenu");

    const returnMenu =
        document.getElementById("returnMenu");

    const maintenanceMenu =
        document.getElementById("maintenanceMenu");


    if (equipmentMenu) {
        equipmentMenu.textContent =
            "Manage Equipment";
    }

    if (borrowingMenu) {
        borrowingMenu.textContent =
            "Approve / Reject Requests";
    }

    if (returnMenu) {
        returnMenu.textContent =
            "Returns";
    }

    if (maintenanceMenu) {
        maintenanceMenu.textContent =
            "Maintenance";
    }


    // Quick actions

    const quickActions =
        document.getElementById("quickActions");

    if (!quickActions) {
        return;
    }

    quickActions.innerHTML = `

        <div class="action-grid">

            <button
                type="button"
                onclick="window.location.href='equipment.html'">
                Manage Equipment
            </button>

            <button
                type="button"
                onclick="window.location.href='borrowing.html'">
                Review Requests
            </button>

            <button
                type="button"
                onclick="window.location.href='maintenance.html'">
                Manage Maintenance
            </button>

            <button
                type="button"
                onclick="window.location.href='audit-logs.html'">
                View Audit Logs
            </button>

        </div>

    `;
}


// ==========================================
// STAFF MENU
// ==========================================

function showStaffMenu() {

    setMenuVisibility(
        "equipmentMenu",
        true
    );

    setMenuVisibility(
        "borrowingMenu",
        true
    );

    setMenuVisibility(
        "returnMenu",
        true
    );

    setMenuVisibility(
        "maintenanceMenu",
        true
    );

    setMenuVisibility(
        "auditMenu",
        false
    );


    // Change menu labels

    const equipmentMenu =
        document.getElementById("equipmentMenu");

    const borrowingMenu =
        document.getElementById("borrowingMenu");

    const returnMenu =
        document.getElementById("returnMenu");

    const maintenanceMenu =
        document.getElementById("maintenanceMenu");


    if (equipmentMenu) {
        equipmentMenu.textContent =
            "View Equipment";
    }

    if (borrowingMenu) {
        borrowingMenu.textContent =
            "Borrow Equipment";
    }

    if (returnMenu) {
        returnMenu.textContent =
            "Process Returns";
    }

    if (maintenanceMenu) {
        maintenanceMenu.textContent =
            "Maintenance Request";
    }


    // Quick actions

    const quickActions =
        document.getElementById("quickActions");

    if (!quickActions) {
        return;
    }

    quickActions.innerHTML = `

        <div class="action-grid">

            <button
                type="button"
                onclick="window.location.href='equipment.html'">
                View Equipment
            </button>

            <button
                type="button"
                onclick="window.location.href='borrowing.html'">
                Create Borrowing
            </button>

            <button
                type="button"
                onclick="window.location.href='returns.html'">
                Process Return
            </button>

            <button
                type="button"
                onclick="window.location.href='maintenance.html'">
                Submit Maintenance
            </button>

        </div>

    `;
}


// ==========================================
// REQUESTER / VIEWER MENU
// ==========================================

function showRequesterMenu() {

    // Requester can view equipment
    setMenuVisibility(
        "equipmentMenu",
        true
    );

    // Requester can submit borrowing requests
    setMenuVisibility(
        "borrowingMenu",
        true
    );

    // Requester cannot process returns
    setMenuVisibility(
        "returnMenu",
        false
    );

    // Requester cannot manage maintenance
    setMenuVisibility(
        "maintenanceMenu",
        false
    );

    // Requester cannot see audit logs
    setMenuVisibility(
        "auditMenu",
        false
    );


    // Change labels

    const equipmentMenu =
        document.getElementById("equipmentMenu");

    const borrowingMenu =
        document.getElementById("borrowingMenu");


    if (equipmentMenu) {
        equipmentMenu.textContent =
            "Available Equipment";
    }

    if (borrowingMenu) {
        borrowingMenu.textContent =
            "Request Equipment";
    }


    // Quick actions

    const quickActions =
        document.getElementById("quickActions");

    if (!quickActions) {
        return;
    }

    quickActions.innerHTML = `

        <div class="action-grid">

            <button
                type="button"
                onclick="window.location.href='equipment.html'">
                View Equipment
            </button>

            <button
                type="button"
                onclick="window.location.href='borrowing.html'">
                Request Equipment
            </button>

            <button
                type="button"
                onclick="window.location.href='borrowing.html'">
                My Requests
            </button>

        </div>

    `;
}


// ==========================================
// LOAD DASHBOARD DATA
// ==========================================

async function loadDashboardNumbers(
    role,
    userId
) {

    // ==========================================
    // EQUIPMENT
    // ==========================================

    const {
        data: equipment,
        error: equipmentError
    } = await supabaseClient
        .from("equipment")
        .select("status");


    if (equipmentError) {

        console.error(
            "Equipment loading error:",
            equipmentError
        );

    }


    if (equipment) {

        const total =
            equipment.length;

        const available =
            equipment.filter(item =>
                String(item.status)
                    .toLowerCase() === "available"
            ).length;

        const borrowed =
            equipment.filter(item =>
                String(item.status)
                    .toLowerCase() === "borrowed"
            ).length;


        const totalElement =
            document.getElementById(
                "totalEquipment"
            );

        const availableElement =
            document.getElementById(
                "availableEquipment"
            );

        const borrowedElement =
            document.getElementById(
                "borrowedEquipment"
            );


        if (totalElement) {
            totalElement.textContent =
                total;
        }

        if (availableElement) {
            availableElement.textContent =
                available;
        }

        if (borrowedElement) {
            borrowedElement.textContent =
                borrowed;
        }

    }


    // ==========================================
    // PENDING REQUESTS
    // ==========================================

    let requestQuery =
        supabaseClient
            .from("borrowing_requests")
            .select("id")
            .eq("status", "Pending");


    // Requester/Viewer should only see
    // their own pending requests.
    //
    // This assumes the borrowing_requests
    // table uses user_id for the requester.
    //
    // We will verify the actual table structure
    // when we work on borrowing.js.

    if (
        role === "requester" ||
        role === "viewer"
    ) {

        requestQuery =
            requestQuery.eq(
                "user_id",
                userId
            );

    }


    const {
        data: requests,
        error: requestError
    } = await requestQuery;


    if (requestError) {

        console.error(
            "Request loading error:",
            requestError
        );

        return;
    }


    const pendingElement =
        document.getElementById(
            "pendingRequests"
        );


    if (pendingElement) {

        pendingElement.textContent =
            requests
                ? requests.length
                : 0;

    }

}


// ==========================================
// LOGOUT
// ==========================================

async function logout() {

    try {

        await supabaseClient.auth.signOut();

    } catch (error) {

        console.error(
            "Logout error:",
            error
        );

    }

    sessionStorage.clear();

    window.location.href =
        "login.html";
}
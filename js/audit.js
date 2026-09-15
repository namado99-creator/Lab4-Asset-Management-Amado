// =====================================================
// AUDIT LOGS
// Laboratory Asset Management
// =====================================================

let currentUser = null;
let currentProfile = null;
let allLogs = [];


// =====================================================
// INITIALIZE
// =====================================================

document.addEventListener("DOMContentLoaded", async () => {
    await initializeAuditLogs();
});


// =====================================================
// INITIALIZE USER
// =====================================================

async function initializeAuditLogs() {

    try {

        const {
            data: { user },
            error: authError
        } = await supabase.auth.getUser();

        if (authError || !user) {
            window.location.href = "login.html";
            return;
        }

        currentUser = user;


        // Get profile
        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("id, full_name, role")
            .eq("id", user.id)
            .maybeSingle();

        if (profileError) {
            console.error("Profile error:", profileError);
            showMessage("Unable to load your profile.", "error");
            return;
        }

        if (!profile) {
            await supabase.auth.signOut();
            window.location.href = "login.html";
            return;
        }

        currentProfile = profile;


        // Normalize role
        const role = String(profile.role || "").toLowerCase().trim();


        // Only Administrator can view audit logs
        if (role !== "administrator") {

            showMessage(
                "Access denied. Only Administrator can view audit logs.",
                "error"
            );

            setTimeout(() => {
                window.location.href = "dashboard.html";
            }, 1500);

            return;
        }


        // Save session information
        sessionStorage.setItem("userId", user.id);
        sessionStorage.setItem("userRole", role);
        sessionStorage.setItem(
            "userName",
            profile.full_name || user.email || "User"
        );
        sessionStorage.setItem(
            "userEmail",
            user.email || ""
        );


        // Display user
        document.getElementById("userName").textContent =
            profile.full_name || "Administrator";

        document.getElementById("userRole").textContent =
            formatRole(role);


        // Role-based navigation
        applyRoleAccess(role);


        // Load audit logs
        await loadAuditLogs();


        // Search
        document
            .getElementById("searchInput")
            .addEventListener("input", filterLogs);


        // Module filter
        document
            .getElementById("moduleFilter")
            .addEventListener("change", filterLogs);


        // Logout
        document
            .getElementById("logoutBtn")
            .addEventListener("click", logout);


    } catch (error) {

        console.error("Initialization error:", error);

        showMessage(
            "An unexpected error occurred.",
            "error"
        );
    }
}


// =====================================================
// LOAD AUDIT LOGS
// =====================================================

async function loadAuditLogs() {

    const tableBody =
        document.getElementById("auditTableBody");

    tableBody.innerHTML = `
        <tr>
            <td colspan="7">
                Loading audit logs...
            </td>
        </tr>
    `;


    try {

        const {
            data: logs,
            error
        } = await supabase
            .from("audit_logs")
            .select(`
                id,
                user_id,
                action,
                module,
                record_id,
                description,
                created_at
            `)
            .order("created_at", {
                ascending: false
            });


        if (error) {
            console.error("Audit log error:", error);

            tableBody.innerHTML = `
                <tr>
                    <td colspan="7">
                        Unable to load audit logs.
                    </td>
                </tr>
            `;

            showMessage(
                "Unable to load audit logs. Check your RLS policy.",
                "error"
            );

            return;
        }


        allLogs = logs || [];


        // Get user names
        const userIds = [
            ...new Set(
                allLogs
                    .map(log => log.user_id)
                    .filter(Boolean)
            )
        ];


        let userMap = {};


        if (userIds.length > 0) {

            const {
                data: profiles,
                error: usersError
            } = await supabase
                .from("profiles")
                .select("id, full_name")
                .in("id", userIds);


            if (!usersError && profiles) {

                profiles.forEach(profile => {

                    userMap[profile.id] =
                        profile.full_name || "Unknown User";

                });
            }
        }


        // Attach names
        allLogs = allLogs.map(log => ({
            ...log,
            user_name:
                userMap[log.user_id] || "Unknown User"
        }));


        renderLogs(allLogs);

    } catch (error) {

        console.error("Load logs error:", error);

        tableBody.innerHTML = `
            <tr>
                <td colspan="7">
                    Error loading audit logs.
                </td>
            </tr>
        `;
    }
}


// =====================================================
// RENDER LOGS
// =====================================================

function renderLogs(logs) {

    const tableBody =
        document.getElementById("auditTableBody");

    const logCount =
        document.getElementById("logCount");


    logCount.textContent =
        `${logs.length} record${logs.length !== 1 ? "s" : ""}`;


    if (logs.length === 0) {

        tableBody.innerHTML = `
            <tr>
                <td colspan="7">
                    No audit logs found.
                </td>
            </tr>
        `;

        return;
    }


    tableBody.innerHTML = logs.map(log => {

        const date = formatDate(log.created_at);

        return `
            <tr>

                <td>${escapeHTML(log.id)}</td>

                <td>${escapeHTML(log.user_name)}</td>

                <td>
                    <span class="status-badge">
                        ${escapeHTML(log.action)}
                    </span>
                </td>

                <td>${escapeHTML(log.module)}</td>

                <td>
                    ${log.record_id !== null
                        ? escapeHTML(log.record_id)
                        : "-"
                    }
                </td>

                <td>
                    ${escapeHTML(
                        log.description || "-"
                    )}
                </td>

                <td>${escapeHTML(date)}</td>

            </tr>
        `;

    }).join("");
}


// =====================================================
// SEARCH + FILTER
// =====================================================

function filterLogs() {

    const searchValue =
        document
            .getElementById("searchInput")
            .value
            .toLowerCase()
            .trim();


    const moduleValue =
        document
            .getElementById("moduleFilter")
            .value
            .toLowerCase()
            .trim();


    const filtered = allLogs.filter(log => {

        const searchableText = `
            ${log.user_name || ""}
            ${log.action || ""}
            ${log.module || ""}
            ${log.description || ""}
            ${log.record_id || ""}
        `.toLowerCase();


        const matchesSearch =
            !searchValue ||
            searchableText.includes(searchValue);


        const matchesModule =
            !moduleValue ||
            String(log.module || "")
                .toLowerCase()
                .trim() === moduleValue;


        return matchesSearch && matchesModule;

    });


    renderLogs(filtered);
}


// =====================================================
// ROLE ACCESS
// =====================================================

function applyRoleAccess(role) {

    const links =
        document.querySelectorAll("[data-access]");


    links.forEach(link => {

        const allowedRoles =
            link
                .getAttribute("data-access")
                .split(",")
                .map(item => item.trim().toLowerCase());


        if (!allowedRoles.includes(role)) {
            link.style.display = "none";
        }

    });
}


// =====================================================
// FORMAT ROLE
// =====================================================

function formatRole(role) {

    if (role === "administrator") {
        return "Administrator";
    }

    if (role === "staff") {
        return "Laboratory Staff";
    }

    if (role === "requester") {
        return "Requester";
    }

    return role;
}


// =====================================================
// FORMAT DATE
// =====================================================

function formatDate(dateValue) {

    if (!dateValue) {
        return "-";
    }


    const date = new Date(dateValue);


    return date.toLocaleString("en-PH", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
}


// =====================================================
// ESCAPE HTML
// =====================================================

function escapeHTML(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// =====================================================
// MESSAGE
// =====================================================

function showMessage(message, type = "info") {

    const element =
        document.getElementById("auditMessage");


    if (!element) {
        return;
    }


    element.textContent = message;

    element.className =
        type === "error"
            ? "message error"
            : "message success";


    setTimeout(() => {

        element.textContent = "";
        element.className = "";

    }, 4000);
}


// =====================================================
// LOGOUT
// =====================================================

async function logout() {

    try {

        const { error } =
            await supabase.auth.signOut();


        if (error) {
            console.error("Logout error:", error);
            return;
        }


        sessionStorage.clear();

        window.location.href = "login.html";

    } catch (error) {

        console.error("Logout error:", error);

        sessionStorage.clear();

        window.location.href = "login.html";
    }
}
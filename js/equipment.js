// =====================================================
// EQUIPMENT MANAGEMENT
// =====================================================

let currentUser = null;
let currentProfile = null;
let editingEquipmentId = null;


// =====================================================
// PAGE START
// =====================================================

document.addEventListener(
    "DOMContentLoaded",
    initializeEquipmentPage
);


// =====================================================
// INITIALIZE
// =====================================================

async function initializeEquipmentPage() {

    try {

        // ------------------------------------------------
        // CHECK LOGIN
        // ------------------------------------------------

        const {
            data,
            error
        } = await supabaseClient.auth.getUser();


        if (error) {

            console.error(
                "Authentication error:",
                error
            );

            window.location.href =
                "login.html";

            return;
        }


        if (!data || !data.user) {

            window.location.href =
                "login.html";

            return;
        }


        currentUser =
            data.user;


        // ------------------------------------------------
        // LOAD PROFILE
        // ------------------------------------------------

        const {
            data: profile,
            error: profileError
        } = await supabaseClient
            .from("profiles")
            .select(
                "id, full_name, role"
            )
            .eq(
                "id",
                currentUser.id
            )
            .maybeSingle();


        if (profileError) {

            console.error(
                "Profile error:",
                profileError
            );

            showTableError(
                profileError.message
            );

            return;
        }


        if (!profile) {

            console.error(
                "No profile found."
            );

            showTableError(
                "No profile found for this account."
            );

            return;
        }


        currentProfile =
            profile;


        // ------------------------------------------------
        // SESSION STORAGE
        // ------------------------------------------------

        const role =
            normalizeRole(
                profile.role
            );


        sessionStorage.setItem(
            "userId",
            currentUser.id
        );

        sessionStorage.setItem(
            "userRole",
            role
        );

        sessionStorage.setItem(
            "userName",
            profile.full_name
        );

        sessionStorage.setItem(
            "userEmail",
            currentUser.email
        );


        // ------------------------------------------------
        // USER INFO
        // ------------------------------------------------

        const userInfo =
            document.getElementById(
                "userInfo"
            );


        if (userInfo) {

            userInfo.textContent =
                `${profile.full_name} • ${formatRole(role)}`;

        }


        // ------------------------------------------------
        // ROLE ACCESS
        // ------------------------------------------------

        setupRoleAccess(
            role
        );


        // ------------------------------------------------
        // LOAD EQUIPMENT
        // ------------------------------------------------

        await loadEquipment();


        // ------------------------------------------------
        // SEARCH
        // ------------------------------------------------

        const searchInput =
            document.getElementById(
                "searchInput"
            );


        if (searchInput) {

            searchInput.addEventListener(
                "input",
                function () {

                    loadEquipment(
                        searchInput.value.trim()
                    );

                }
            );

        }


        // ------------------------------------------------
        // FORM
        // ------------------------------------------------

        const form =
            document.getElementById(
                "equipmentForm"
            );


        if (form) {

            form.addEventListener(
                "submit",
                handleEquipmentSubmit
            );

        }


        // ------------------------------------------------
        // CANCEL EDIT
        // ------------------------------------------------

        const cancelButton =
            document.getElementById(
                "cancelEditBtn"
            );


        if (cancelButton) {

            cancelButton.addEventListener(
                "click",
                cancelEdit
            );

        }


        // ------------------------------------------------
        // LOGOUT
        // ------------------------------------------------

        const logoutButton =
            document.getElementById(
                "logoutBtn"
            );


        if (logoutButton) {

            logoutButton.addEventListener(
                "click",
                logout
            );

        }


    } catch (error) {

        console.error(
            "Equipment page error:",
            error
        );

        showTableError(
            error.message
        );

    }

}


// =====================================================
// LOAD EQUIPMENT
// =====================================================

async function loadEquipment(
    searchTerm = ""
) {

    const tableBody =
        document.getElementById(
            "equipmentTableBody"
        );


    const recordCount =
        document.getElementById(
            "recordCount"
        );


    if (!tableBody) {

        console.error(
            "equipmentTableBody not found."
        );

        return;
    }


    tableBody.innerHTML = `
        <tr>
            <td colspan="8" class="loading-state">
                Loading equipment...
            </td>
        </tr>
    `;


    // ------------------------------------------------
    // QUERY EQUIPMENT
    // ------------------------------------------------

    const {
        data,
        error
    } = await supabaseClient
        .from("equipment")
        .select(
            "id, equipment_code, equipment_name, category, laboratory, quantity, status, created_at"
        )
        .order(
            "created_at",
            {
                ascending: false
            }
        );


    // ------------------------------------------------
    // ERROR
    // ------------------------------------------------

    if (error) {

        console.error(
            "Equipment query error:",
            error
        );

        showTableError(
            error.message
        );

        if (recordCount) {

            recordCount.textContent =
                "0 records";

        }

        return;
    }


    // ------------------------------------------------
    // DATA
    // ------------------------------------------------

    let equipment =
        data || [];


    console.log(
        "Equipment records:",
        equipment
    );


    // ------------------------------------------------
    // REQUESTER ONLY SEES AVAILABLE
    // ------------------------------------------------

    const role =
        normalizeRole(
            currentProfile?.role
        );


    if (role === "requester") {

        equipment =
            equipment.filter(
                item =>
                    item.status === "Available"
            );

    }


    // ------------------------------------------------
    // SEARCH
    // ------------------------------------------------

    if (searchTerm !== "") {

        const search =
            searchTerm.toLowerCase();


        equipment =
            equipment.filter(
                item => {

                    const searchableText = [

                        item.equipment_code,

                        item.equipment_name,

                        item.category,

                        item.laboratory,

                        item.status

                    ]
                        .filter(
                            value =>
                                value !== null &&
                                value !== undefined
                        )
                        .join(" ")
                        .toLowerCase();


                    return searchableText.includes(
                        search
                    );

                }
            );

    }


    // ------------------------------------------------
    // COUNT
    // ------------------------------------------------

    if (recordCount) {

        recordCount.textContent =
            `${equipment.length} record${equipment.length === 1 ? "" : "s"}`;

    }


    // ------------------------------------------------
    // NO DATA
    // ------------------------------------------------

    if (equipment.length === 0) {

        tableBody.innerHTML = `
            <tr>
                <td colspan="8">
                    No equipment records found.
                </td>
            </tr>
        `;

        return;
    }


    // ------------------------------------------------
    // DISPLAY RECORDS
    // ------------------------------------------------

    tableBody.innerHTML = "";


    equipment.forEach(
        function (item) {

            const row =
                document.createElement("tr");


            const created =
                item.created_at
                    ? new Date(
                        item.created_at
                    ).toLocaleDateString()
                    : "-";


            let actions = `
                <button
                    type="button"
                    class="view-btn"
                    onclick="viewEquipment(${item.id})">
                    View
                </button>
            `;


            // Administrator actions
            if (
                role === "administrator"
            ) {

                actions += `
                    <button
                        type="button"
                        class="edit-btn"
                        onclick="editEquipment(${item.id})">
                        Edit
                    </button>

                    <button
                        type="button"
                        class="delete-btn"
                        onclick="deleteEquipment(${item.id})">
                        Delete
                    </button>
                `;

            }


            row.innerHTML = `

                <td>
                    ${escapeHTML(
                        item.equipment_code
                    )}
                </td>

                <td>
                    ${escapeHTML(
                        item.equipment_name
                    )}
                </td>

                <td>
                    ${escapeHTML(
                        item.category
                    )}
                </td>

                <td>
                    ${escapeHTML(
                        item.laboratory
                    )}
                </td>

                <td>
                    ${item.quantity}
                </td>

                <td>
                    <span class="status ${getStatusClass(item.status)}">
                        ${escapeHTML(
                            item.status
                        )}
                    </span>
                </td>

                <td>
                    ${created}
                </td>

                <td>
                    ${actions}
                </td>

            `;


            tableBody.appendChild(
                row
            );

        }
    );

}


// =====================================================
// ROLE ACCESS
// =====================================================

function setupRoleAccess(
    role
) {

    document
        .querySelectorAll(
            "[data-access]"
        )
        .forEach(
            function (element) {

                const allowedRoles =
                    element
                        .getAttribute(
                            "data-access"
                        )
                        .split(" ");


                if (
                    allowedRoles.includes(
                        role
                    )
                ) {

                    element.style.display =
                        "";

                } else {

                    element.style.display =
                        "none";

                }

            }
        );


    // Only Administrator sees Add Equipment
    const addSection =
        document.getElementById(
            "addEquipmentSection"
        );


    if (addSection) {

        if (
            role === "administrator"
        ) {

            addSection.style.display =
                "";

        } else {

            addSection.style.display =
                "none";

        }

    }

}


// =====================================================
// ADD / UPDATE EQUIPMENT
// =====================================================

async function handleEquipmentSubmit(
    event
) {

    event.preventDefault();


    const role =
        normalizeRole(
            currentProfile?.role
        );


    if (
        role !== "administrator"
    ) {

        showMessage(
            "Only the Administrator can manage equipment.",
            "error"
        );

        return;
    }


    const code =
        document
            .getElementById(
                "equipmentCode"
            )
            .value
            .trim();


    const name =
        document
            .getElementById(
                "equipmentName"
            )
            .value
            .trim();


    const category =
        document
            .getElementById(
                "category"
            )
            .value
            .trim();


    const laboratory =
        document
            .getElementById(
                "laboratory"
            )
            .value
            .trim();


    const quantity =
        parseInt(
            document
                .getElementById(
                    "quantity"
                )
                .value
        );


    const status =
        document
            .getElementById(
                "status"
            )
            .value;


    if (
        !code ||
        !name ||
        !category ||
        !laboratory ||
        !quantity ||
        quantity < 1
    ) {

        showMessage(
            "Please complete all required fields.",
            "error"
        );

        return;
    }


    // ------------------------------------------------
    // UPDATE
    // ------------------------------------------------

    if (
        editingEquipmentId !== null
    ) {

        const {
            error
        } = await supabaseClient
            .from("equipment")
            .update({

                equipment_code:
                    code,

                equipment_name:
                    name,

                category:
                    category,

                laboratory:
                    laboratory,

                quantity:
                    quantity,

                status:
                    status

            })
            .eq(
                "id",
                editingEquipmentId
            );


        if (error) {

            console.error(
                "Update error:",
                error
            );

            showMessage(
                error.message,
                "error"
            );

            return;
        }


        showMessage(
            "Equipment updated successfully.",
            "success"
        );

    }


    // ------------------------------------------------
    // INSERT
    // ------------------------------------------------

    else {

        const {
            error
        } = await supabaseClient
            .from("equipment")
            .insert({

                equipment_code:
                    code,

                equipment_name:
                    name,

                category:
                    category,

                laboratory:
                    laboratory,

                quantity:
                    quantity,

                status:
                    status

            });


        if (error) {

            console.error(
                "Insert error:",
                error
            );

            showMessage(
                error.message,
                "error"
            );

            return;
        }


        showMessage(
            "Equipment added successfully.",
            "success"
        );

    }


    resetForm();

    await loadEquipment();

}


// =====================================================
// EDIT EQUIPMENT
// =====================================================

async function editEquipment(
    id
) {

    if (
        normalizeRole(
            currentProfile?.role
        ) !== "administrator"
    ) {

        alert(
            "Only the Administrator can edit equipment."
        );

        return;
    }


    const {
        data,
        error
    } = await supabaseClient
        .from("equipment")
        .select(
            "id, equipment_code, equipment_name, category, laboratory, quantity, status"
        )
        .eq(
            "id",
            id
        )
        .single();


    if (error) {

        console.error(
            "Edit error:",
            error
        );

        alert(
            error.message
        );

        return;
    }


    editingEquipmentId =
        id;


    document.getElementById(
        "equipmentCode"
    ).value =
        data.equipment_code || "";


    document.getElementById(
        "equipmentName"
    ).value =
        data.equipment_name || "";


    document.getElementById(
        "category"
    ).value =
        data.category || "";


    document.getElementById(
        "laboratory"
    ).value =
        data.laboratory || "";


    document.getElementById(
        "quantity"
    ).value =
        data.quantity || 1;


    document.getElementById(
        "status"
    ).value =
        data.status || "Available";


    document.getElementById(
        "equipmentFormTitle"
    ).textContent =
        "Edit Equipment";


    document.getElementById(
        "saveEquipmentBtn"
    ).textContent =
        "Update Equipment";


    document.getElementById(
        "cancelEditBtn"
    ).style.display =
        "inline-block";


    document
        .getElementById(
            "addEquipmentSection"
        )
        .scrollIntoView({
            behavior: "smooth"
        });

}


// =====================================================
// CANCEL EDIT
// =====================================================

function cancelEdit() {

    resetForm();

}


// =====================================================
// RESET FORM
// =====================================================

function resetForm() {

    editingEquipmentId =
        null;


    const form =
        document.getElementById(
            "equipmentForm"
        );


    if (form) {

        form.reset();

    }


    document.getElementById(
        "quantity"
    ).value = 1;


    document.getElementById(
        "status"
    ).value =
        "Available";


    document.getElementById(
        "equipmentFormTitle"
    ).textContent =
        "Add Equipment";


    document.getElementById(
        "saveEquipmentBtn"
    ).textContent =
        "Add Equipment";


    document.getElementById(
        "cancelEditBtn"
    ).style.display =
        "none";

}


// =====================================================
// VIEW EQUIPMENT
// =====================================================

async function viewEquipment(
    id
) {

    const {
        data,
        error
    } = await supabaseClient
        .from("equipment")
        .select(
            "equipment_code, equipment_name, category, laboratory, quantity, status"
        )
        .eq(
            "id",
            id
        )
        .single();


    if (error) {

        console.error(
            "View error:",
            error
        );

        alert(
            error.message
        );

        return;
    }


    alert(

        "Equipment Details\n\n" +

        "Equipment Code: " +
        data.equipment_code +

        "\nEquipment Name: " +
        data.equipment_name +

        "\nCategory: " +
        data.category +

        "\nLaboratory: " +
        data.laboratory +

        "\nQuantity: " +
        data.quantity +

        "\nStatus: " +
        data.status

    );

}


// =====================================================
// DELETE EQUIPMENT
// =====================================================

async function deleteEquipment(
    id
) {

    if (
        normalizeRole(
            currentProfile?.role
        ) !== "administrator"
    ) {

        alert(
            "Only the Administrator can delete equipment."
        );

        return;
    }


    const confirmed =
        confirm(
            "Are you sure you want to delete this equipment?"
        );


    if (!confirmed) {
        return;
    }


    const {
        error
    } = await supabaseClient
        .from("equipment")
        .delete()
        .eq(
            "id",
            id
        );


    if (error) {

        console.error(
            "Delete error:",
            error
        );

        alert(
            "Unable to delete equipment: " +
            error.message
        );

        return;
    }


    alert(
        "Equipment deleted successfully."
    );


    await loadEquipment();

}


// =====================================================
// LOGOUT
// =====================================================

async function logout() {

    const {
        error
    } = await supabaseClient.auth.signOut();


    if (error) {

        console.error(
            "Logout error:",
            error
        );

        alert(
            "Unable to logout."
        );

        return;
    }


    sessionStorage.clear();


    window.location.href =
        "login.html";

}


// =====================================================
// MESSAGE
// =====================================================

function showMessage(
    message,
    type
) {

    const element =
        document.getElementById(
            "equipmentMessage"
        );


    if (!element) {
        return;
    }


    element.textContent =
        message;


    element.className =
        type;


    setTimeout(
        function () {

            element.textContent =
                "";

            element.className =
                "";

        },
        4000
    );

}


// =====================================================
// TABLE ERROR
// =====================================================

function showTableError(
    message
) {

    const tableBody =
        document.getElementById(
            "equipmentTableBody"
        );


    const recordCount =
        document.getElementById(
            "recordCount"
        );


    if (recordCount) {

        recordCount.textContent =
            "Error";

    }


    if (tableBody) {

        tableBody.innerHTML = `
            <tr>
                <td colspan="8">
                    <strong>Error loading equipment.</strong>
                    <br>
                    <small>
                        ${escapeHTML(message)}
                    </small>
                </td>
            </tr>
        `;

    }

}


// =====================================================
// STATUS CLASS
// =====================================================

function getStatusClass(
    status
) {

    if (!status) {
        return "";
    }


    return status
        .toString()
        .toLowerCase()
        .replace(
            /\s+/g,
            "-"
        );

}


// =====================================================
// NORMALIZE ROLE
// =====================================================

function normalizeRole(
    role
) {

    if (!role) {
        return "";
    }


    return role
        .toString()
        .trim()
        .toLowerCase()
        .replace(
            /\s+/g,
            "_"
        );

}


// =====================================================
// FORMAT ROLE
// =====================================================

function formatRole(
    role
) {

    if (
        role === "administrator"
    ) {

        return "Administrator";

    }


    if (
        role === "staff"
    ) {

        return "Laboratory Staff";

    }


    if (
        role === "requester"
    ) {

        return "Requester";

    }


    return role || "";

}


// =====================================================
// ESCAPE HTML
// =====================================================

function escapeHTML(
    value
) {

    if (
        value === null ||
        value === undefined
    ) {

        return "";

    }


    return String(value)

        .replace(
            /&/g,
            "&amp;"
        )

        .replace(
            /</g,
            "&lt;"
        )

        .replace(
            />/g,
            "&gt;"
        )

        .replace(
            /"/g,
            "&quot;"
        )

        .replace(
            /'/g,
            "&#039;"
        );

}
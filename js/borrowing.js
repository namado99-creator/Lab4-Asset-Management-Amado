// =====================================================
// BORROWING REQUEST MANAGEMENT
// =====================================================

let currentUser = null;
let currentProfile = null;
let currentRequests = [];


// =====================================================
// PAGE START
// =====================================================

document.addEventListener(
    "DOMContentLoaded",
    initializeBorrowingPage
);


// =====================================================
// INITIALIZE PAGE
// =====================================================

async function initializeBorrowingPage() {

    try {

        // ------------------------------------------------
        // CHECK AUTHENTICATION
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

            showRequestError(
                profileError.message
            );

            return;
        }


        if (!profile) {

            showRequestError(
                "No profile found for this account."
            );

            return;
        }


        currentProfile =
            profile;


        // ------------------------------------------------
        // ROLE
        // ------------------------------------------------

        const role =
            normalizeRole(
                profile.role
            );


        // ------------------------------------------------
        // SESSION
        // ------------------------------------------------

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
        // LOAD AVAILABLE EQUIPMENT
        // ------------------------------------------------

        await loadAvailableEquipment();


        // ------------------------------------------------
        // LOAD BORROWING REQUESTS
        // ------------------------------------------------

        await loadBorrowingRequests();


        // ------------------------------------------------
        // FORM SUBMIT
        // ------------------------------------------------

        const form =
            document.getElementById(
                "borrowingForm"
            );


        if (form) {

            form.addEventListener(
                "submit",
                submitBorrowingRequest
            );

        }


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
                applyFilters
            );

        }


        // ------------------------------------------------
        // STATUS FILTER
        // ------------------------------------------------

        const statusFilter =
            document.getElementById(
                "statusFilter"
            );


        if (statusFilter) {

            statusFilter.addEventListener(
                "change",
                applyFilters
            );

        }


        // ------------------------------------------------
        // CANCEL
        // ------------------------------------------------

        const cancelButton =
            document.getElementById(
                "cancelBorrowingBtn"
            );


        if (cancelButton) {

            cancelButton.addEventListener(
                "click",
                resetBorrowingForm
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
            "Borrowing page error:",
            error
        );

        showRequestError(
            error.message
        );

    }

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


    // ------------------------------------------------
    // Borrowing form
    // Administrator, Staff, Requester
    // ------------------------------------------------

    const requestSection =
        document.getElementById(
            "borrowingFormSection"
        );


    if (requestSection) {

        if (
            role === "administrator" ||
            role === "staff" ||
            role === "requester"
        ) {

            requestSection.style.display =
                "";

        } else {

            requestSection.style.display =
                "none";

        }

    }

}


// =====================================================
// LOAD AVAILABLE EQUIPMENT
// =====================================================

async function loadAvailableEquipment() {

    const equipmentSelect =
        document.getElementById(
            "equipmentSelect"
        );


    if (!equipmentSelect) {
        return;
    }


    equipmentSelect.innerHTML = `
        <option value="">
            Loading equipment...
        </option>
    `;


    const {
        data,
        error
    } = await supabaseClient
        .from("equipment")
        .select(
            "id, equipment_code, equipment_name, quantity, status"
        )
        .eq(
            "status",
            "Available"
        )
        .gt(
            "quantity",
            0
        )
        .order(
            "equipment_code",
            {
                ascending: true
            }
        );


    if (error) {

        console.error(
            "Equipment loading error:",
            error
        );


        equipmentSelect.innerHTML = `
            <option value="">
                Unable to load equipment
            </option>
        `;

        return;
    }


    equipmentSelect.innerHTML = `
        <option value="">
            Select equipment
        </option>
    `;


    if (!data || data.length === 0) {

        equipmentSelect.innerHTML += `
            <option value="">
                No available equipment
            </option>
        `;

        return;
    }


    data.forEach(
        function (equipment) {

            const option =
                document.createElement(
                    "option"
                );


            option.value =
                equipment.id;


            option.textContent =
                `${equipment.equipment_code} - ${equipment.equipment_name} (${equipment.quantity} available)`;


            equipmentSelect.appendChild(
                option
            );

        }
    );

}


// =====================================================
// SUBMIT BORROWING REQUEST
// =====================================================

async function submitBorrowingRequest(
    event
) {

    event.preventDefault();


    if (!currentUser || !currentProfile) {

        showRequestMessage(
            "Please login again.",
            "error"
        );

        return;
    }


    const equipmentSelect =
        document.getElementById(
            "equipmentSelect"
        );


    const quantityInput =
        document.getElementById(
            "quantity"
        );


    const purposeInput =
        document.getElementById(
            "purpose"
        );


    if (
        !equipmentSelect ||
        !quantityInput ||
        !purposeInput
    ) {

        showRequestMessage(
            "Borrowing form is incomplete.",
            "error"
        );

        return;
    }


    const equipmentId =
        parseInt(
            equipmentSelect.value
        );


    const quantity =
        parseInt(
            quantityInput.value
        );


    const purpose =
        purposeInput.value.trim();


    // ------------------------------------------------
    // VALIDATION
    // ------------------------------------------------

    if (
        !equipmentId ||
        !quantity ||
        quantity < 1 ||
        !purpose
    ) {

        showRequestMessage(
            "Please complete all required fields.",
            "error"
        );

        return;
    }


    // ------------------------------------------------
    // CHECK EQUIPMENT
    // ------------------------------------------------

    const {
        data: equipment,
        error: equipmentError
    } = await supabaseClient
        .from("equipment")
        .select(
            "id, equipment_code, equipment_name, quantity, status"
        )
        .eq(
            "id",
            equipmentId
        )
        .single();


    if (equipmentError) {

        console.error(
            "Equipment check error:",
            equipmentError
        );

        showRequestMessage(
            equipmentError.message,
            "error"
        );

        return;
    }


    // ------------------------------------------------
    // BR-A4-01
    // Only Available equipment may be requested
    // ------------------------------------------------

    if (
        equipment.status !== "Available"
    ) {

        showRequestMessage(
            "This equipment is not available.",
            "error"
        );

        await loadAvailableEquipment();

        return;
    }


    // ------------------------------------------------
    // BR-A4-09
    // Maintenance equipment cannot be borrowed
    // ------------------------------------------------

    if (
        equipment.status === "Maintenance"
    ) {

        showRequestMessage(
            "Equipment under maintenance cannot be borrowed.",
            "error"
        );

        return;
    }


    // ------------------------------------------------
    // CHECK QUANTITY
    // ------------------------------------------------

    if (
        quantity > equipment.quantity
    ) {

        showRequestMessage(
            `Only ${equipment.quantity} unit(s) are available.`,
            "error"
        );

        return;
    }


    // ------------------------------------------------
    // INSERT REQUEST
    // ------------------------------------------------

    const {
        data: request,
        error: requestError
    } = await supabaseClient
        .from("borrowing_requests")
        .insert({

            equipment_id:
                equipmentId,

            requester_id:
                currentUser.id,

            quantity:
                quantity,

            purpose:
                purpose,

            status:
                "Pending"

        })
        .select()
        .single();


    if (requestError) {

        console.error(
            "Borrowing request error:",
            requestError
        );

        showRequestMessage(
            requestError.message,
            "error"
        );

        return;
    }


    // ------------------------------------------------
    // AUDIT LOG
    // ------------------------------------------------

    await createAuditLog(
        "CREATE",
        "Borrowing Requests",
        request.id,
        `Created borrowing request for ${equipment.equipment_code}`
    );


    showRequestMessage(
        "Borrowing request submitted successfully.",
        "success"
    );


    resetBorrowingForm();


    await loadAvailableEquipment();

    await loadBorrowingRequests();

}


// =====================================================
// LOAD BORROWING REQUESTS
// =====================================================

async function loadBorrowingRequests() {

    const tableBody =
        document.getElementById(
            "borrowingTableBody"
        );


    const recordCount =
        document.getElementById(
            "recordCount"
        );


    if (!tableBody) {

        console.error(
            "borrowingTableBody not found."
        );

        return;
    }


    tableBody.innerHTML = `
        <tr>
            <td colspan="9" class="loading-state">
                Loading borrowing requests...
            </td>
        </tr>
    `;


    // ------------------------------------------------
    // BASE QUERY
    // ------------------------------------------------

    let query =
        supabaseClient
            .from("borrowing_requests")
            .select(
                "id, equipment_id, requester_id, quantity, purpose, request_date, status, approved_by, approved_at, released_at, returned_at, created_at"
            )
            .order(
                "created_at",
                {
                    ascending: false
                }
            );


    // ------------------------------------------------
    // REQUESTER ONLY SEES OWN REQUESTS
    // ------------------------------------------------

    const role =
        normalizeRole(
            currentProfile?.role
        );


    if (
        role === "requester"
    ) {

        query =
            query.eq(
                "requester_id",
                currentUser.id
            );

    }


    const {
        data,
        error
    } = await query;


    if (error) {

        console.error(
            "Borrowing query error:",
            error
        );

        showRequestError(
            error.message
        );

        return;
    }


    currentRequests =
        data || [];


    // ------------------------------------------------
    // LOAD RELATED DATA
    // ------------------------------------------------

    const equipmentIds =
        [
            ...new Set(
                currentRequests
                    .map(
                        request =>
                            request.equipment_id
                    )
                    .filter(
                        id => id !== null
                    )
            )
        ];


    const requesterIds =
        [
            ...new Set(
                currentRequests
                    .map(
                        request =>
                            request.requester_id
                    )
                    .filter(
                        id => id !== null
                    )
            )
        ];


    const approverIds =
        [
            ...new Set(
                currentRequests
                    .map(
                        request =>
                            request.approved_by
                    )
                    .filter(
                        id => id !== null
                    )
            )
        ];


    let equipmentMap = {};
    let profileMap = {};


    // ------------------------------------------------
    // EQUIPMENT
    // ------------------------------------------------

    if (
        equipmentIds.length > 0
    ) {

        const {
            data: equipmentData,
            error: equipmentError
        } = await supabaseClient
            .from("equipment")
            .select(
                "id, equipment_code, equipment_name"
            )
            .in(
                "id",
                equipmentIds
            );


        if (equipmentError) {

            console.error(
                "Equipment relation error:",
                equipmentError
            );

        } else {

            (equipmentData || [])
                .forEach(
                    equipment => {

                        equipmentMap[
                            equipment.id
                        ] =
                            equipment;

                    }
                );

        }

    }


    // ------------------------------------------------
    // PROFILES
    // ------------------------------------------------

    const allProfileIds =
        [
            ...new Set(
                [
                    ...requesterIds,
                    ...approverIds
                ]
            )
        ];


    if (
        allProfileIds.length > 0
    ) {

        const {
            data: profileData,
            error: profileError
        } = await supabaseClient
            .from("profiles")
            .select(
                "id, full_name"
            )
            .in(
                "id",
                allProfileIds
            );


        if (profileError) {

            console.error(
                "Profile relation error:",
                profileError
            );

        } else {

            (profileData || [])
                .forEach(
                    profile => {

                        profileMap[
                            profile.id
                        ] =
                            profile;

                    }
                );

        }

    }


    // ------------------------------------------------
    // COUNT
    // ------------------------------------------------

    if (recordCount) {

        recordCount.textContent =
            `${currentRequests.length} record${currentRequests.length === 1 ? "" : "s"}`;

    }


    // ------------------------------------------------
    // NO RECORDS
    // ------------------------------------------------

    if (
        currentRequests.length === 0
    ) {

        tableBody.innerHTML = `
            <tr>
                <td colspan="9">
                    No borrowing requests found.
                </td>
            </tr>
        `;

        return;
    }


    // ------------------------------------------------
    // STORE RELATED DATA
    // ------------------------------------------------

    currentRequests =
        currentRequests.map(
            request => ({

                ...request,

                equipmentInfo:
                    equipmentMap[
                        request.equipment_id
                    ] || null,

                requesterInfo:
                    profileMap[
                        request.requester_id
                    ] || null,

                approverInfo:
                    request.approved_by
                        ? profileMap[
                            request.approved_by
                        ] || null
                        : null

            })
        );


    renderBorrowingRequests(
        currentRequests
    );

}


// =====================================================
// RENDER REQUESTS
// =====================================================

function renderBorrowingRequests(
    requests
) {

    const tableBody =
        document.getElementById(
            "borrowingTableBody"
        );


    if (!tableBody) {
        return;
    }


    tableBody.innerHTML = "";


    const role =
        normalizeRole(
            currentProfile?.role
        );


    requests.forEach(
        function (request) {

            const row =
                document.createElement(
                    "tr"
                );


            const equipment =
                request.equipmentInfo;


            const requester =
                request.requesterInfo;


            const approver =
                request.approverInfo;


            const requestDate =
                formatDate(
                    request.request_date ||
                    request.created_at
                );


            let actions = `
                <button
                    type="button"
                    class="view-btn"
                    onclick="viewBorrowingRequest(${request.id})">
                    View
                </button>
            `;


            // ------------------------------------------------
            // ADMIN APPROVAL
            // ------------------------------------------------

            if (
                role === "administrator" &&
                request.status === "Pending"
            ) {

                actions += `

                    <button
                        type="button"
                        class="approve-btn"
                        onclick="approveRequest(${request.id})">
                        Approve
                    </button>

                    <button
                        type="button"
                        class="reject-btn"
                        onclick="rejectRequest(${request.id})">
                        Reject
                    </button>

                `;

            }


            // ------------------------------------------------
            // RELEASE
            // Admin and Staff
            // ------------------------------------------------

            if (
                (
                    role === "administrator" ||
                    role === "staff"
                ) &&
                request.status === "Approved"
            ) {

                actions += `

                    <button
                        type="button"
                        class="release-btn"
                        onclick="releaseRequest(${request.id})">
                        Release
                    </button>

                `;

            }


            // ------------------------------------------------
            // RETURN
            // Admin and Staff
            // ------------------------------------------------

            if (
                (
                    role === "administrator" ||
                    role === "staff"
                ) &&
                request.status === "Released"
            ) {

                actions += `

                    <button
                        type="button"
                        class="return-btn"
                        onclick="returnRequest(${request.id})">
                        Return
                    </button>

                `;

            }


            row.innerHTML = `

                <td>
                    #${request.id}
                </td>

                <td>
                    ${
                        equipment
                            ? escapeHTML(
                                equipment.equipment_code +
                                " - " +
                                equipment.equipment_name
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
                    ${request.quantity}
                </td>

                <td>
                    ${escapeHTML(
                        request.purpose
                    )}
                </td>

                <td>
                    ${requestDate}
                </td>

                <td>
                    <span class="status ${getStatusClass(request.status)}">
                        ${escapeHTML(
                            request.status
                        )}
                    </span>
                </td>

                <td>
                    ${
                        approver
                            ? escapeHTML(
                                approver.full_name
                            )
                            : "-"
                    }
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
// APPROVE REQUEST
// Administrator ONLY
// =====================================================

async function approveRequest(
    requestId
) {

    const role =
        normalizeRole(
            currentProfile?.role
        );


    if (
        role !== "administrator"
    ) {

        alert(
            "Only the Administrator can approve requests."
        );

        return;
    }


    const request =
        currentRequests.find(
            item =>
                item.id === requestId
        );


    if (!request) {

        alert(
            "Request not found."
        );

        return;
    }


    // ------------------------------------------------
    // BR-A4-02
    // Staff/Admin cannot approve own request
    // ------------------------------------------------

    if (
        request.requester_id ===
        currentUser.id
    ) {

        alert(
            "You cannot approve your own request."
        );

        return;
    }


    if (
        request.status !== "Pending"
    ) {

        alert(
            "Only Pending requests can be approved."
        );

        return;
    }


    const confirmed =
        confirm(
            `Approve borrowing request #${requestId}?`
        );


    if (!confirmed) {
        return;
    }


    const {
        error
    } = await supabaseClient
        .from("borrowing_requests")
        .update({

            status:
                "Approved",

            approved_by:
                currentUser.id,

            approved_at:
                new Date().toISOString()

        })
        .eq(
            "id",
            requestId
        )
        .eq(
            "status",
            "Pending"
        );


    if (error) {

        console.error(
            "Approve error:",
            error
        );

        alert(
            error.message
        );

        return;
    }


    await createAuditLog(
        "APPROVE",
        "Borrowing Requests",
        requestId,
        `Approved borrowing request #${requestId}`
    );


    alert(
        "Borrowing request approved."
    );


    await loadBorrowingRequests();

}


// =====================================================
// REJECT REQUEST
// Administrator ONLY
// =====================================================

async function rejectRequest(
    requestId
) {

    const role =
        normalizeRole(
            currentProfile?.role
        );


    if (
        role !== "administrator"
    ) {

        alert(
            "Only the Administrator can reject requests."
        );

        return;
    }


    const request =
        currentRequests.find(
            item =>
                item.id === requestId
        );


    if (!request) {

        alert(
            "Request not found."
        );

        return;
    }


    if (
        request.requester_id ===
        currentUser.id
    ) {

        alert(
            "You cannot reject your own request."
        );

        return;
    }


    if (
        request.status !== "Pending"
    ) {

        alert(
            "Only Pending requests can be rejected."
        );

        return;
    }


    const confirmed =
        confirm(
            `Reject borrowing request #${requestId}?`
        );


    if (!confirmed) {
        return;
    }


    const {
        error
    } = await supabaseClient
        .from("borrowing_requests")
        .update({

            status:
                "Rejected",

            approved_by:
                currentUser.id,

            approved_at:
                new Date().toISOString()

        })
        .eq(
            "id",
            requestId
        )
        .eq(
            "status",
            "Pending"
        );


    if (error) {

        console.error(
            "Reject error:",
            error
        );

        alert(
            error.message
        );

        return;
    }


    await createAuditLog(
        "REJECT",
        "Borrowing Requests",
        requestId,
        `Rejected borrowing request #${requestId}`
    );


    alert(
        "Borrowing request rejected."
    );


    await loadBorrowingRequests();

}


// =====================================================
// RELEASE REQUEST
// Admin / Staff
// =====================================================

async function releaseRequest(
    requestId
) {

    const role =
        normalizeRole(
            currentProfile?.role
        );


    if (
        role !== "administrator" &&
        role !== "staff"
    ) {

        alert(
            "You are not allowed to release equipment."
        );

        return;
    }


    const request =
        currentRequests.find(
            item =>
                item.id === requestId
        );


    if (!request) {

        alert(
            "Request not found."
        );

        return;
    }


    // ------------------------------------------------
    // BR-A4-04
    // Only Approved may be released
    // ------------------------------------------------

    if (
        request.status !== "Approved"
    ) {

        alert(
            "Only Approved requests can be released."
        );

        return;
    }


    const equipment =
        request.equipmentInfo;


    if (!equipment) {

        alert(
            "Equipment information not found."
        );

        return;
    }


    // ------------------------------------------------
    // GET CURRENT EQUIPMENT
    // ------------------------------------------------

    const {
        data: currentEquipment,
        error: equipmentError
    } = await supabaseClient
        .from("equipment")
        .select(
            "id, equipment_code, equipment_name, quantity, status"
        )
        .eq(
            "id",
            request.equipment_id
        )
        .single();


    if (equipmentError) {

        console.error(
            "Equipment error:",
            equipmentError
        );

        alert(
            equipmentError.message
        );

        return;
    }


    // ------------------------------------------------
    // EQUIPMENT MUST BE AVAILABLE
    // ------------------------------------------------

    if (
        currentEquipment.status !==
        "Available"
    ) {

        alert(
            "This equipment is no longer available."
        );

        return;
    }


    if (
        currentEquipment.quantity <
        request.quantity
    ) {

        alert(
            "There is not enough equipment available."
        );

        return;
    }


    const confirmed =
        confirm(
            `Release equipment for request #${requestId}?`
        );


    if (!confirmed) {
        return;
    }


    // ------------------------------------------------
    // UPDATE EQUIPMENT
    // BR-A4-05
    // Released equipment becomes Borrowed
    // ------------------------------------------------

    const {
        error: updateEquipmentError
    } = await supabaseClient
        .from("equipment")
        .update({

            status:
                "Borrowed"

        })
        .eq(
            "id",
            currentEquipment.id
        );


    if (updateEquipmentError) {

        console.error(
            "Equipment update error:",
            updateEquipmentError
        );

        alert(
            "Unable to update equipment: " +
            updateEquipmentError.message
        );

        return;
    }


    // ------------------------------------------------
    // UPDATE REQUEST
    // ------------------------------------------------

    const {
        error: requestError
    } = await supabaseClient
        .from("borrowing_requests")
        .update({

            status:
                "Released",

            released_at:
                new Date().toISOString()

        })
        .eq(
            "id",
            requestId
        )
        .eq(
            "status",
            "Approved"
        );


    if (requestError) {

        console.error(
            "Release request error:",
            requestError
        );

        // Try to restore equipment
        await supabaseClient
            .from("equipment")
            .update({
                status: "Available"
            })
            .eq(
                "id",
                currentEquipment.id
            );


        alert(
            requestError.message
        );

        return;
    }


    await createAuditLog(
        "RELEASE",
        "Borrowing Requests",
        requestId,
        `Released equipment ${currentEquipment.equipment_code} for request #${requestId}`
    );


    alert(
        "Equipment released successfully."
    );


    await loadAvailableEquipment();

    await loadBorrowingRequests();

}


// =====================================================
// RETURN REQUEST
// Admin / Staff
// =====================================================

async function returnRequest(
    requestId
) {

    const role =
        normalizeRole(
            currentProfile?.role
        );


    if (
        role !== "administrator" &&
        role !== "staff"
    ) {

        alert(
            "You are not allowed to process returns."
        );

        return;
    }


    const request =
        currentRequests.find(
            item =>
                item.id === requestId
        );


    if (!request) {

        alert(
            "Request not found."
        );

        return;
    }


    // ------------------------------------------------
    // BR-A4-08
    // Returned cannot be processed twice
    // ------------------------------------------------

    if (
        request.status !== "Released"
    ) {

        alert(
            "Only Released requests can be returned."
        );

        return;
    }


    const equipment =
        request.equipmentInfo;


    if (!equipment) {

        alert(
            "Equipment information not found."
        );

        return;
    }


    const confirmed =
        confirm(
            `Process return for request #${requestId}?`
        );


    if (!confirmed) {
        return;
    }


    // ------------------------------------------------
    // GET CURRENT EQUIPMENT
    // ------------------------------------------------

    const {
        data: currentEquipment,
        error: equipmentError
    } = await supabaseClient
        .from("equipment")
        .select(
            "id, equipment_code, quantity, status"
        )
        .eq(
            "id",
            request.equipment_id
        )
        .single();


    if (equipmentError) {

        console.error(
            "Equipment error:",
            equipmentError
        );

        alert(
            equipmentError.message
        );

        return;
    }


    // ------------------------------------------------
    // BR-A4-06
    // Returned equipment becomes Available
    // unless damaged
    // ------------------------------------------------

    let newEquipmentStatus =
        "Available";


    if (
        currentEquipment.status ===
        "Damaged"
    ) {

        newEquipmentStatus =
            "Damaged";

    }


    // ------------------------------------------------
    // UPDATE EQUIPMENT
    // ------------------------------------------------

    const {
        error: equipmentUpdateError
    } = await supabaseClient
        .from("equipment")
        .update({

            status:
                newEquipmentStatus

        })
        .eq(
            "id",
            currentEquipment.id
        );


    if (equipmentUpdateError) {

        console.error(
            "Equipment return error:",
            equipmentUpdateError
        );

        alert(
            "Unable to update equipment: " +
            equipmentUpdateError.message
        );

        return;
    }


    // ------------------------------------------------
    // UPDATE BORROWING REQUEST
    // ------------------------------------------------

    const {
        error: requestError
    } = await supabaseClient
        .from("borrowing_requests")
        .update({

            status:
                "Returned",

            returned_at:
                new Date().toISOString()

        })
        .eq(
            "id",
            requestId
        )
        .eq(
            "status",
            "Released"
        );


    if (requestError) {

        console.error(
            "Return request error:",
            requestError
        );

        // Restore previous equipment state
        await supabaseClient
            .from("equipment")
            .update({

                status:
                    currentEquipment.status

            })
            .eq(
                "id",
                currentEquipment.id
            );


        alert(
            requestError.message
        );

        return;
    }


    await createAuditLog(
        "RETURN",
        "Borrowing Requests",
        requestId,
        `Returned equipment ${currentEquipment.equipment_code} for request #${requestId}`
    );


    alert(
        "Equipment returned successfully."
    );


    await loadAvailableEquipment();

    await loadBorrowingRequests();

}


// =====================================================
// VIEW REQUEST
// =====================================================

function viewBorrowingRequest(
    requestId
) {

    const request =
        currentRequests.find(
            item =>
                item.id === requestId
        );


    if (!request) {

        alert(
            "Request not found."
        );

        return;
    }


    const equipment =
        request.equipmentInfo;


    const requester =
        request.requesterInfo;


    const approver =
        request.approverInfo;


    const details = `

Borrowing Request #${request.id}

Equipment:
${
    equipment
        ? equipment.equipment_code +
          " - " +
          equipment.equipment_name
        : "Unknown"
}

Requester:
${
    requester
        ? requester.full_name
        : "Unknown"
}

Quantity:
${request.quantity}

Purpose:
${request.purpose}

Request Date:
${formatDate(
    request.request_date ||
    request.created_at
)}

Status:
${request.status}

Approved By:
${
    approver
        ? approver.full_name
        : "-"
}

Approved At:
${formatDate(
    request.approved_at
)}

Released At:
${formatDate(
    request.released_at
)}

Returned At:
${formatDate(
    request.returned_at
)}
`;


    alert(
        details
    );

}


// =====================================================
// FILTERS
// =====================================================

function applyFilters() {

    const searchInput =
        document.getElementById(
            "searchInput"
        );


    const statusFilter =
        document.getElementById(
            "statusFilter"
        );


    const search =
        searchInput
            ? searchInput.value
                .trim()
                .toLowerCase()
            : "";


    const selectedStatus =
        statusFilter
            ? statusFilter.value
            : "";


    const filtered =
        currentRequests.filter(
            function (request) {

                const equipment =
                    request.equipmentInfo;


                const requester =
                    request.requesterInfo;


                const searchableText = [

                    request.id,

                    equipment
                        ? equipment.equipment_code
                        : "",

                    equipment
                        ? equipment.equipment_name
                        : "",

                    requester
                        ? requester.full_name
                        : "",

                    request.purpose,

                    request.status

                ]
                    .filter(
                        value =>
                            value !== null &&
                            value !== undefined
                    )
                    .join(" ")
                    .toLowerCase();


                const matchesSearch =
                    search === "" ||
                    searchableText.includes(
                        search
                    );


                const matchesStatus =
                    selectedStatus === "" ||
                    request.status ===
                        selectedStatus;


                return (
                    matchesSearch &&
                    matchesStatus
                );

            }
        );


    renderBorrowingRequests(
        filtered
    );


    const recordCount =
        document.getElementById(
            "recordCount"
        );


    if (recordCount) {

        recordCount.textContent =
            `${filtered.length} record${filtered.length === 1 ? "" : "s"}`;

    }

}


// =====================================================
// RESET FORM
// =====================================================

function resetBorrowingForm() {

    const form =
        document.getElementById(
            "borrowingForm"
        );


    if (form) {

        form.reset();

    }


    const quantity =
        document.getElementById(
            "quantity"
        );


    if (quantity) {

        quantity.value =
            1;

    }

}


// =====================================================
// AUDIT LOG
// =====================================================

async function createAuditLog(
    action,
    module,
    recordId,
    description
) {

    try {

        const {
            error
        } = await supabaseClient
            .from("audit_logs")
            .insert({

                user_id:
                    currentUser.id,

                action:
                    action,

                module:
                    module,

                record_id:
                    recordId,

                description:
                    description

            });


        if (error) {

            console.error(
                "Audit log error:",
                error
            );

        }

    } catch (error) {

        console.error(
            "Audit log exception:",
            error
        );

    }

}


// =====================================================
// REQUEST MESSAGE
// =====================================================

function showRequestMessage(
    message,
    type
) {

    const element =
        document.getElementById(
            "borrowingMessage"
        );


    if (!element) {

        alert(
            message
        );

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

function showRequestError(
    message
) {

    const tableBody =
        document.getElementById(
            "borrowingTableBody"
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
                <td colspan="9">
                    <strong>
                        Error loading borrowing requests.
                    </strong>

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
// DATE FORMAT
// =====================================================

function formatDate(
    value
) {

    if (!value) {
        return "-";
    }


    const date =
        new Date(value);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return "-";

    }


    return date.toLocaleString();

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
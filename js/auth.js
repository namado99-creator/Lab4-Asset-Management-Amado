document.addEventListener("DOMContentLoaded", () => {

    const loginForm = document.getElementById("loginForm");

    if (!loginForm) {
        return;
    }

    loginForm.addEventListener("submit", async (event) => {

        event.preventDefault();

        const emailInput = document.getElementById("email");
        const passwordInput = document.getElementById("password");
        const message = document.getElementById("loginMessage");

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        message.textContent = "Logging in...";
        message.className = "";

        try {

            // ==========================================
            // 1. LOGIN USING SUPABASE AUTHENTICATION
            // ==========================================

            const { data, error } =
                await supabaseClient.auth.signInWithPassword({
                    email: email,
                    password: password
                });

            if (error) {
                console.error("Login error:", error);

                message.textContent = error.message;
                message.className = "error-message";

                return;
            }

            const user = data.user;

            if (!user) {
                message.textContent = "Unable to get logged-in user.";
                message.className = "error-message";

                return;
            }

            console.log("Authenticated user:", user.id);


            // ==========================================
            // 2. GET USER PROFILE AND ROLE
            // ==========================================

            const { data: profile, error: profileError } =
                await supabaseClient
                    .from("profiles")
                    .select("id, full_name, role")
                    .eq("id", user.id)
                    .maybeSingle();


            // ==========================================
            // 3. CHECK PROFILE ERROR
            // ==========================================

            if (profileError) {

                console.error("Profile lookup error:", profileError);

                await supabaseClient.auth.signOut();

                message.textContent =
                    "Unable to load your user profile. Check the profiles table and RLS policy.";

                message.className = "error-message";

                return;
            }


            // ==========================================
            // 4. CHECK IF PROFILE EXISTS
            // ==========================================

            if (!profile) {

                console.error(
                    "No profile found for authenticated user:",
                    user.id
                );

                await supabaseClient.auth.signOut();

                message.textContent =
                    "Login successful, but no profile was found for this account.";

                message.className = "error-message";

                return;
            }


            // ==========================================
            // 5. GET AND NORMALIZE ROLE
            // ==========================================

            const role = String(profile.role || "")
                .trim()
                .toLowerCase();

            const fullName =
                profile.full_name ||
                user.email ||
                "User";


            console.log("User profile:", profile);
            console.log("User role:", role);


            // ==========================================
            // 6. CHECK VALID ROLE
            // ==========================================

            const validRoles = [
                "administrator",
                "staff",
                "laboratory_staff",
                "requester",
                "viewer"
            ];

            if (!validRoles.includes(role)) {

                console.error("Invalid role:", role);

                await supabaseClient.auth.signOut();

                message.textContent =
                    "Invalid user role. Please check the role in the profiles table.";

                message.className = "error-message";

                return;
            }


            // ==========================================
            // 7. SAVE USER INFORMATION
            // ==========================================

            sessionStorage.setItem("userId", user.id);
            sessionStorage.setItem("userRole", role);
            sessionStorage.setItem("userName", fullName);
            sessionStorage.setItem("userEmail", user.email);


            // ==========================================
            // 8. REDIRECT USER
            // ==========================================

            message.textContent = "Login successful. Redirecting...";
            message.className = "success-message";


            setTimeout(() => {
                window.location.href = "dashboard.html";
            }, 300);


        } catch (error) {

            console.error("Unexpected authentication error:", error);

            message.textContent =
                "Something went wrong while logging in.";

            message.className = "error-message";
        }

    });

});
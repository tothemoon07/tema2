// admin_logic.js

// ⚠️ PEGA AQUÍ TUS DATOS DE SUPABASE (Del Paso 1)
const SUPABASE_URL = 'https://tpzuvrvjtxuvmyusjmpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwenV2cnZqdHh1dm15dXNqbXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NDMwMDAsImV4cCI6MjA4MDExOTAwMH0.YcGZLy7W92H0o0TN4E_v-2PUDtcSXhB-D7x7ob6TTp4';

// Inicializamos el cliente de Supabase
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- LÓGICA DE INICIO DE SESIÓN ---

// Elementos del DOM (Pantalla de Login)
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const errorMessage = document.getElementById('error-message');
const loginButton = document.getElementById('login-button');

// 1. Verificar si ya estás logueado (Para no pedir clave a cada rato)
async function checkSession() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    // Si estamos en el login y YA hay sesión, mandar al dashboard
    if (session && window.location.pathname.includes('admin_login.html')) {
        window.location.href = 'admin_panel.html'; // Redirigir al panel
    }

    // Si estamos en el panel y NO hay sesión, mandar al login
    if (!session && !window.location.pathname.includes('admin_login.html')) {
        window.location.href = 'admin_login.html'; // Expulsar al login
    }
}

// Ejecutar verificación al cargar
checkSession();

// 2. Función para iniciar sesión (Login)
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // Evitar que la página se recargue
        
        // Mostrar estado de "Cargando..."
        loginButton.disabled = true;
        loginButton.textContent = 'Verificando...';
        errorMessage.style.display = 'none';

        const email = emailInput.value;
        const password = passwordInput.value;

        // Intentar loguearse con Supabase
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            // Si falla (contraseña errónea o usuario no existe)
            console.error('Error login:', error);
            errorMessage.textContent = 'Credenciales incorrectas. Intenta de nuevo.';
            errorMessage.style.display = 'block';
            loginButton.disabled = false;
            loginButton.textContent = 'Ingresar';
        } else {
            // Si es exitoso
            console.log('Login correcto:', data);
            window.location.href = 'admin_panel.html'; // ¡Adentro!
        }
    });
}

// 3. Función para Cerrar Sesión (Logout)
async function logout() {
    const { error } = await supabaseClient.auth.signOut();
    if (!error) {
        window.location.href = 'admin_login.html';
    }
}

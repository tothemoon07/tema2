// client_logic.js - VERSIÓN COMPLETA Y CORREGIDA

// ⚠️ TUS CLAVES
const SUPABASE_URL = 'https://tpzuvrvjtxuvmyusjmpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwenV2cnZqdHh1dm15dXNqbXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NDMwMDAsImV4cCI6MjA4MDExOTAwMH0.YcGZLy7W92H0o0TN4E_v-2PUDtcSXhB-D7x7ob6TTp4';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables Globales (NO declaramos currentStep aquí porque ya está en tu HTML)
let ticketsReservados = []; 
let intervaloTimer = null;

// ==========================================
// 1. FUNCIONES UI (MENÚS Y MODALES) - RESTAURADAS
// ==========================================

// Menú Hamburguesa (Móvil)
window.toggleMenu = function() {
    const nav = document.querySelector('.nav-links');
    if (nav) nav.classList.toggle('active');
}

// Abrir Modal de Compra
window.abrirModalCompra = function() {
    // Verificar si ya está agotado antes de abrir
    const btn = document.querySelector('button[onclick="abrirModalCompra()"]');
    if (btn && (btn.disabled || btn.innerText.includes('AGOTADO'))) {
        return; 
    }

    const modal = document.getElementById('modal-compra');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex'; // Asegurar display flex
        
        // Resetear pasos
        if (typeof currentStep !== 'undefined') {
            currentStep = 1; // Usamos la variable global del HTML
            mostrarPaso(1);
        }
    }
}

window.cerrarModalCompra = function() {
    const modal = document.getElementById('modal-compra');
    if (modal) modal.classList.add('hidden');
    liberarTickets(); // Liberar si cierra
}

// Abrir Modal Verificar
window.abrirModalVerificar = function() {
    const modal = document.getElementById('modal-verificar');
    if (modal) modal.classList.remove('hidden');
}

window.cerrarModalVerificar = function() {
    const modal = document.getElementById('modal-verificar');
    if (modal) modal.classList.add('hidden');
}

// Utilidad para mostrar pasos
function mostrarPaso(paso) {
    // Ocultar todos
    for(let i=1; i<=5; i++){
        const el = document.getElementById(`step-${i}`);
        if(el) el.classList.add('hidden');
    }
    // Mostrar actual
    const actual = document.getElementById(`step-${paso}`);
    if(actual) actual.classList.remove('hidden');
    
    // Actualizar Header del modal si existe la función
    if(typeof updateModalHeader === 'function') updateModalHeader();
}


// ==========================================
// 2. VALIDACIÓN ESTRICTA (EL INTERCEPTOR)
// ==========================================

async function validarStockReal() {
    const inputElement = document.getElementById('custom-qty');
    if (!inputElement) return false;

    const cantidadSolicitada = parseInt(inputElement.value, 10);
    
    if (!cantidadSolicitada || cantidadSolicitada <= 0) {
        Swal.fire('Error', 'Selecciona al menos 1 boleto.', 'error');
        return false;
    }

    // Consulta a la Base de Datos
    const { count, error } = await supabaseClient
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'disponible');

    if (error) {
        console.error("Error Supabase:", error);
        Swal.fire('Error', 'Error de conexión.', 'error');
        return false;
    }

    const stockReal = Number(count); 

    // BLOQUEO TOTAL
    if (stockReal < cantidadSolicitada) {
        Swal.fire({
            icon: 'error',
            title: '¡STOCK INSUFICIENTE!',
            html: `
                <div style="text-align: left;">
                    <p>⛔ <b>No puedes avanzar.</b></p>
                    <p>Pediste: <b style="color: red;">${cantidadSolicitada}</b></p>
                    <p>Quedan: <b style="color: green;">${stockReal}</b></p>
                    <br><small>Por favor reduce la cantidad.</small>
                </div>
            `,
            confirmButtonColor: '#d33',
            confirmButtonText: 'Entendido'
        });
        return false; // IMPIDE AVANZAR
    }

    return await reservarTicketsEnDB(cantidadSolicitada);
}

async function reservarTicketsEnDB(cantidad) {
    try {
        const { data: ticketsLibres, error } = await supabaseClient
            .from('tickets')
            .select('id, numero')
            .eq('estado', 'disponible')
            .limit(cantidad);

        if (error || !ticketsLibres || ticketsLibres.length < cantidad) {
            Swal.fire('Ups', 'Esos boletos acaban de venderse. Intenta de nuevo.', 'warning');
            return false;
        }

        const ids = ticketsLibres.map(t => t.id);
        await supabaseClient.from('tickets').update({ estado: 'bloqueado' }).in('id', ids);

        ticketsReservados = ticketsLibres;
        return true;

    } catch (e) {
        console.error(e);
        return false;
    }
}


// ==========================================
// 3. NAVEGACIÓN (NEXT STEP)
// ==========================================

window.nextStep = async function() {
    // Usamos window.currentStep o la variable global implícita
    let paso = (typeof currentStep !== 'undefined') ? currentStep : 1;

    // === PASO 2: VALIDACIÓN CRÍTICA ===
    if (paso === 2) {
        const btn = document.getElementById('btn-next');
        const txtOriginal = btn ? btn.innerHTML : 'Continuar';
        
        if(btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
            btn.disabled = true;
        }

        // 🛑 LLAMADA AL INTERCEPTOR
        const puedePasar = await validarStockReal();

        if(btn) {
            btn.innerHTML = txtOriginal;
            btn.disabled = false;
        }

        if (!puedePasar) return; // SE DETIENE AQUÍ SI NO HAY STOCK

        iniciarTimer();
    }

    // Avance normal
    if (paso < 5) {
        if (paso === 4) {
            const instr = document.getElementById('payment-instructions');
            if(instr) instr.classList.remove('hidden');
            return; 
        }
        
        // Ocultar actual
        document.getElementById(`step-${paso}`).classList.add('hidden');
        // Incrementar variable global
        currentStep++; 
        // Mostrar siguiente
        document.getElementById(`step-${currentStep}`).classList.remove('hidden');
        
        if (typeof updateModalHeader === 'function') updateModalHeader();
    } else {
        procesarCompraFinal();
    }
};


// ==========================================
// 4. UTILIDADES (TIMER, UPLOAD, FINAL)
// ==========================================

function iniciarTimer() {
    clearInterval(intervaloTimer);
    let timeLeft = 900; 
    const container = document.getElementById('timer-container');
    if(container) container.classList.remove('hidden');
    
    intervaloTimer = setInterval(() => {
        let min = Math.floor(timeLeft / 60);
        let sec = timeLeft % 60;
        sec = sec < 10 ? '0' + sec : sec;
        const el = document.getElementById('countdown');
        if(el) el.innerText = `${min}:${sec}`;

        if (timeLeft <= 0) {
            clearInterval(intervaloTimer);
            liberarTickets();
            Swal.fire({ title: 'Tiempo Agotado', icon: 'error', confirmButtonText: 'Reiniciar' })
                .then(() => location.reload());
        }
        timeLeft--;
    }, 1000);
}

async function liberarTickets() {
    if (ticketsReservados.length === 0) return;
    const ids = ticketsReservados.map(t => t.id);
    await supabaseClient.from('tickets').update({ estado: 'disponible' }).in('id', ids);
    ticketsReservados = [];
}

async function subirComprobante(file) {
    const fileName = `${Date.now()}.${file.name.split('.').pop()}`;
    const { error } = await supabaseClient.storage.from('comprobantes').upload(fileName, file);
    if (error) throw error;
    const { data } = supabaseClient.storage.from('comprobantes').getPublicUrl(fileName);
    return data.publicUrl;
}

async function procesarCompraFinal() {
    const nombre = document.getElementById('input-name')?.value;
    const cedula = document.getElementById('input-cedula')?.value;
    const telefono = (document.getElementById('input-country-code')?.value || '') + (document.getElementById('input-phone')?.value || '');
    const email = document.getElementById('input-email')?.value;
    const referencia = document.getElementById('input-referencia')?.value;
    const fileInput = document.getElementById('input-comprobante');
    const cantidad = parseInt(document.getElementById('custom-qty')?.value || 0);
    
    let montoTexto = document.getElementById('step4-total')?.innerText || '0';
    let montoFinal = parseFloat(montoTexto.replace('Bs.', '').replace(/\./g, '').replace(',', '.').trim());

    if (!fileInput?.files.length || !referencia) { 
        Swal.fire('Faltan datos', 'Sube el comprobante y la referencia', 'warning'); 
        return; 
    }

    Swal.fire({ title: 'Procesando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const urlImagen = await subirComprobante(fileInput.files[0]);

        const { data: orden, error } = await supabaseClient
            .from('ordenes')
            .insert([{
                nombre, cedula, telefono, email,
                metodo_pago: 'pago_movil',
                referencia_pago: referencia,
                url_comprobante: urlImagen,
                monto_total: montoFinal,
                cantidad_boletos: cantidad,
                estado: 'pendiente_validacion'
            }])
            .select()
            .single();

        if (error) throw error;

        // Asignar los tickets ya reservados
        const ids = ticketsReservados.map(t => t.id);
        const numeros = ticketsReservados.map(t => t.numero);

        await supabaseClient.from('tickets')
            .update({ estado: 'pendiente', id_orden: orden.id })
            .in('id', ids);

        ticketsReservados = [];
        clearInterval(intervaloTimer);
        Swal.close();

        // Mostrar Éxito
        const container = document.getElementById('assigned-tickets');
        if(container) {
            container.innerHTML = numeros.map(n => 
                `<span class="bg-red-100 text-red-700 font-bold px-3 py-1 rounded-lg text-sm border border-red-200">${n}</span>`
            ).join('');
        }

        document.getElementById('step-5').classList.add('hidden');
        document.getElementById('modal-footer').classList.add('hidden'); // Ocultar botones modal
        document.getElementById('step-success').classList.remove('hidden');
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });

    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'Hubo un error al procesar. Contacta soporte.', 'error');
    }
}

// Carga Inicial
window.onload = async function() {
    try {
        const { count } = await supabaseClient.from('tickets')
            .select('*', { count: 'exact', head: true })
            .eq('estado', 'disponible');
        
        console.log(`Carga inicial: ${count} disponibles.`);
        
        if (count === 0) {
            const btns = document.querySelectorAll('button[onclick="abrirModalCompra()"]');
            btns.forEach(b => { 
                b.disabled = true; 
                b.innerHTML = '<i class="fas fa-lock"></i> AGOTADO'; 
                b.classList.add('bg-gray-400');
                b.classList.remove('bg-red-600', 'hover:bg-red-700');
            });
        }
    } catch(e) { console.error(e); }
};

// client_logic.js - VALIDACIÓN ESTRICTA DE CANTIDAD

// ⚠️ TUS CLAVES (No borrar)
const SUPABASE_URL = 'https://tpzuvrvjtxuvmyusjmpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwenV2cnZqdHh1dm15dXNqbXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NDMwMDAsImV4cCI6MjA4MDExOTAwMH0.YcGZLy7W92H0o0TN4E_v-2PUDtcSXhB-D7x7ob6TTp4';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables Globales
let ticketsReservados = []; 
let intervaloTimer = null;

// --- 0. VALIDACIÓN INICIAL AL CARGAR ---
async function verificarEstadoGeneral() {
    try {
        const { count, error } = await supabaseClient
            .from('tickets')
            .select('*', { count: 'exact', head: true })
            .eq('estado', 'disponible');

        if (error) { console.error("Error DB:", error); return; }

        console.log(`Sistema listo: Hay ${count} tickets disponibles.`);

        // Si NO hay tickets, bloqueamos todo
        if (count === 0) {
            bloquearBotonCompra();
        }
    } catch (e) {
        console.error("Error verificación inicial:", e);
    }
}

function bloquearBotonCompra() {
    const botonesCompra = document.querySelectorAll('button[onclick="abrirModalCompra()"]');
    botonesCompra.forEach(btn => {
        btn.disabled = true;
        btn.classList.add('bg-gray-400', 'cursor-not-allowed');
        btn.classList.remove('bg-red-500', 'hover:bg-red-600', 'animate-wave-pulse');
        btn.innerHTML = '<iconify-icon icon="solar:lock-keyhole-bold" width="20"></iconify-icon> AGOTADO';
    });
    // Etiqueta de estado
    const etiqueta = document.querySelector('.bg-green-500.text-white');
    if(etiqueta) {
        etiqueta.className = "absolute top-3 right-3 bg-red-600 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-lg";
        etiqueta.innerText = "● SOLD OUT";
    }
}

// Ejecutar al inicio
verificarEstadoGeneral();


// --- 1. UTILIDADES ---
async function subirComprobante(file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const { data, error } = await supabaseClient.storage.from('comprobantes').upload(fileName, file);
    if (error) throw error;
    const { data: { publicUrl } } = supabaseClient.storage.from('comprobantes').getPublicUrl(fileName);
    return publicUrl;
}

// --- 2. LÓGICA DE RESERVA (AQUÍ ESTÁ LA CORRECCIÓN CRÍTICA) ---
async function verificarYBloquearTickets() {
    const inputCantidad = document.getElementById('custom-qty');
    const cantidad = parseInt(inputCantidad.value) || 0;

    if (cantidad <= 0) {
        Swal.fire('Error', 'Selecciona al menos 1 boleto.', 'error');
        return false;
    }

    // A. CONSULTA DE STOCK EXACTO
    const { count, error: errCount } = await supabaseClient
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'disponible');

    if (errCount) {
        console.error("Error red:", errCount);
        return false; // Error de conexión, no dejamos avanzar por seguridad
    }

    // B. VALIDACIÓN ESTRICTA: ¿Pide más de lo que hay?
    if (count < cantidad) {
        // ALERTA CLARA AL USUARIO
        Swal.fire({
            icon: 'warning',
            title: '¡Cantidad no disponible!',
            html: `Intentas comprar <b>${cantidad}</b> boletos, pero solo quedan <b>${count}</b> disponibles.<br><br>Por favor ajusta la cantidad.`,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Entendido'
        });
        
        // Si no queda nada, bloqueamos la UI
        if (count === 0) {
            bloquearBotonCompra();
            location.reload(); // Recargamos para que se actualice todo
        }
        
        return false; // ⛔ IMPIDE AVANZAR AL PASO 3
    }

    // C. INTENTO DE BLOQUEO (RESERVA)
    try {
        // Traemos EXACTAMENTE la cantidad solicitada
        const { data: ticketsLibres, error: errSelect } = await supabaseClient
            .from('tickets')
            .select('id, numero')
            .eq('estado', 'disponible')
            .limit(cantidad);

        // Validación doble: Si la DB nos devolvió menos filas de las pedidas (Race Condition)
        if (errSelect || !ticketsLibres || ticketsLibres.length !== cantidad) {
            Swal.fire({ 
                icon: 'warning', 
                title: '¡Alguien te ganó!', 
                text: 'Justo en este momento alguien compró esos boletos. Intenta de nuevo.' 
            });
            return false; // ⛔ IMPIDE AVANZAR
        }

        const ids = ticketsLibres.map(t => t.id);

        // Actualizamos estado a 'bloqueado'
        const { error: errUpdate } = await supabaseClient
            .from('tickets')
            .update({ estado: 'bloqueado' })
            .in('id', ids);

        if (errUpdate) throw errUpdate;

        // Éxito: Guardamos en memoria
        ticketsReservados = ticketsLibres; 
        console.log(`Bloqueados ${ticketsReservados.length} tickets correctamente.`);
        return true; // ✅ PUEDE AVANZAR

    } catch (e) {
        console.error("Error al bloquear:", e);
        Swal.fire('Error', 'Hubo un problema de conexión. Intenta de nuevo.', 'error');
        return false;
    }
}

async function liberarTickets() {
    if (ticketsReservados.length === 0) return;
    const ids = ticketsReservados.map(t => t.id);
    await supabaseClient.from('tickets').update({ estado: 'disponible' }).in('id', ids);
    ticketsReservados = [];
    console.log("Tickets liberados.");
}

// --- 3. NAVEGACIÓN (nextStep) ---
window.nextStep = async function() {
    // Si estamos en el PASO 2 (Selección) y queremos ir al 3
    if (currentStep === 2) {
        const btn = document.getElementById('btn-next');
        const textoOriginal = btn.innerHTML;
        
        // Feedback visual
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
        btn.disabled = true;

        // LLAMADA A LA VALIDACIÓN
        const exitoReserva = await verificarYBloquearTickets();
        
        // Restaurar botón
        btn.innerHTML = textoOriginal;
        btn.disabled = false;

        // ⛔ SI LA VALIDACIÓN FUE FALSE, NO HACEMOS NADA MÁS (Se queda en paso 2)
        if (!exitoReserva) return; 
        
        // Si fue true, iniciamos timer y avanzamos
        iniciarTimer();
    }

    // Lógica normal de avance de pasos
    if (currentStep < 5) {
        if(currentStep === 4) {
            document.getElementById('payment-instructions').classList.remove('hidden');
            return; 
        }
        document.getElementById(`step-${currentStep}`).classList.add('hidden');
        currentStep++;
        document.getElementById(`step-${currentStep}`).classList.remove('hidden');
        updateModalHeader();
    } else {
        procesarCompraFinal();
    }
}

// --- 4. TEMPORIZADOR ---
function iniciarTimer() {
    clearInterval(intervaloTimer);
    let timeLeft = 900; // 15 minutos
    document.getElementById('timer-container').classList.remove('hidden');
    
    intervaloTimer = setInterval(() => {
        let min = Math.floor(timeLeft / 60);
        let sec = timeLeft % 60;
        sec = sec < 10 ? '0' + sec : sec;
        document.getElementById('countdown').innerText = `${min}:${sec}`;

        if (timeLeft <= 0) {
            clearInterval(intervaloTimer);
            liberarTickets();
            Swal.fire({
                icon: 'error',
                title: 'Tiempo Agotado',
                text: 'La reserva de tus boletos ha expirado.',
                confirmButtonText: 'Reiniciar'
            }).then(() => {
                location.reload();
            });
        }
        timeLeft--;
    }, 1000);
}

// --- 5. PROCESO FINAL ---
async function procesarCompraFinal() {
    const nombre = document.getElementById('input-name').value;
    const cedula = document.getElementById('input-cedula').value;
    const telefono = document.getElementById('input-country-code').value + document.getElementById('input-phone').value;
    const email = document.getElementById('input-email').value;
    const referencia = document.getElementById('input-referencia').value;
    const fileInput = document.getElementById('input-comprobante');
    const cantidad = parseInt(document.getElementById('custom-qty').value);
    
    let montoTexto = document.getElementById('step4-total').innerText;
    let montoFinal = parseFloat(montoTexto.replace('Bs.', '').replace(/\./g, '').replace(',', '.').trim());

    if (!fileInput.files.length) { Swal.fire('Error', 'Sube el comprobante', 'error'); return; }
    if (!referencia) { Swal.fire('Error', 'Ingresa la referencia', 'error'); return; }

    Swal.fire({ title: 'Procesando...', text: 'Validando orden...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const urlImagen = await subirComprobante(fileInput.files[0]);

        // Crear Orden
        const { data: ordenData, error: ordenError } = await supabaseClient
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

        if (ordenError) throw ordenError;

        // ASIGNAR TICKETS (Usamos los que ya reservamos en paso 2)
        // Ya no buscamos de emergencia porque el Paso 2 es estricto
        if (ticketsReservados.length === cantidad) {
            const idsFinales = ticketsReservados.map(t => t.id);
            const numerosFinales = ticketsReservados.map(t => t.numero);

            const { error: updateError } = await supabaseClient
                .from('tickets')
                .update({ 
                    estado: 'pendiente', 
                    id_orden: ordenData.id 
                })
                .in('id', idsFinales);

            if (updateError) throw updateError;

            // --- ÉXITO ---
            ticketsReservados = []; 
            clearInterval(intervaloTimer); 
            Swal.close();

            const container = document.getElementById('assigned-tickets');
            if(container) {
                container.innerHTML = numerosFinales.map(n => 
                    `<span class="bg-red-100 text-red-700 font-bold px-3 py-1 rounded-lg text-sm border border-red-200">${n}</span>`
                ).join('');
            }

            document.getElementById(`step-5`).classList.add('hidden');
            document.getElementById('modal-footer').classList.add('hidden');
            document.getElementById('step-success').classList.remove('hidden');
            confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });

        } else {
            // Caso imposible si el paso 2 funcionó, pero por seguridad:
            throw new Error("Discrepancia en reserva de tickets.");
        }

    } catch (err) {
        console.error("Error final:", err);
        Swal.fire({ icon: 'error', title: 'Error', text: 'Hubo un error registrando los tickets. Contacta a soporte con tu referencia.' });
    }
}

// Liberar si cierra
window.addEventListener('beforeunload', () => {
    if (ticketsReservados.length > 0) {
        // Beacon request (opcional)
    }
});

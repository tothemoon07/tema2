// client_logic.js - Lógica Completa de Compra y Reserva (Versión Final)

// ⚠️ TUS CLAVES (No borrar)
const SUPABASE_URL = 'https://tpzuvrvjtxuvmyusjmpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwenV2cnZqdHh1dm15dXNqbXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NDMwMDAsImV4cCI6MjA4MDExOTAwMH0.YcGZLy7W92H0o0TN4E_v-2PUDtcSXhB-D7x7ob6TTp4';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables Globales
let ticketsReservados = []; // Aquí guardamos los IDs de los tickets reservados
let intervaloTimer = null;

// --- 0. VALIDACIÓN INICIAL (SE EJECUTA AL CARGAR) ---
async function verificarEstadoGeneral() {
    try {
        // Consultamos cuántos tickets 'disponible' existen
        const { count, error } = await supabaseClient
            .from('tickets')
            .select('*', { count: 'exact', head: true })
            .eq('estado', 'disponible');

        if (error) {
            console.error("Error conectando DB:", error);
            return;
        }

        console.log(`Verificación inicial: Hay ${count} tickets disponibles.`);

        // Si NO hay tickets (0), bloqueamos el botón de compra inmediatamente
        if (count === 0) {
            const botonesCompra = document.querySelectorAll('button[onclick="abrirModalCompra()"]');
            botonesCompra.forEach(btn => {
                btn.disabled = true;
                btn.classList.add('bg-gray-400', 'cursor-not-allowed');
                btn.classList.remove('bg-red-500', 'hover:bg-red-600', 'animate-wave-pulse');
                btn.innerHTML = '<iconify-icon icon="solar:lock-keyhole-bold" width="20"></iconify-icon> AGOTADO';
            });
            
            // También actualizamos el slider si existe
            const etiqueta = document.querySelector('.bg-green-500.text-white'); // La etiqueta de "EN CURSO"
            if(etiqueta) {
                etiqueta.className = "absolute top-3 right-3 bg-red-600 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-lg";
                etiqueta.innerText = "● SOLD OUT";
            }
        }
    } catch (e) {
        console.error("Error verificación inicial:", e);
    }
}

// Ejecutamos la verificación apenas lee el archivo
verificarEstadoGeneral();


// --- 1. FUNCIONES DE UTILIDAD ---
async function subirComprobante(file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const { data, error } = await supabaseClient.storage.from('comprobantes').upload(fileName, file);
    if (error) throw error;
    const { data: { publicUrl } } = supabaseClient.storage.from('comprobantes').getPublicUrl(fileName);
    return publicUrl;
}

// --- 2. LÓGICA DE RESERVA (BLOQUEO) ---

// Se llama al pasar del Paso 2 al 3
async function verificarYBloquearTickets() {
    const cantidad = parseInt(document.getElementById('custom-qty').value) || 1;

    // A. Verificar Stock
    const { count, error: errCount } = await supabaseClient
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'disponible');

    if (errCount) {
        console.error("Error consultando stock:", errCount);
        return true; // Dejamos pasar si hay error de red, validamos al final
    }

    // Si pide más de lo que hay
    if (count < cantidad) {
        Swal.fire({
            icon: 'warning',
            title: '¡Boletos Insuficientes!',
            text: `Solo quedan ${count} boletos disponibles. Por favor reduce la cantidad.`,
            confirmButtonColor: '#ef4444'
        });
        
        // Si es 0, actualizamos la interfaz de una vez
        if (count === 0) verificarEstadoGeneral();
        
        return false; // Detiene el proceso
    }

    // B. Intentar Bloquear (Reservar)
    try {
        // Traemos X tickets disponibles
        const { data: ticketsLibres, error: errSelect } = await supabaseClient
            .from('tickets')
            .select('id, numero')
            .eq('estado', 'disponible')
            .limit(cantidad);

        if (errSelect || !ticketsLibres || ticketsLibres.length < cantidad) {
            Swal.fire({ icon: 'warning', title: 'Ups', text: 'Alguien acaba de ganar los boletos. Intenta de nuevo.' });
            return false;
        }

        const ids = ticketsLibres.map(t => t.id);

        // Los actualizamos a 'bloqueado'
        const { error: errUpdate } = await supabaseClient
            .from('tickets')
            .update({ estado: 'bloqueado' })
            .in('id', ids);

        if (errUpdate) throw errUpdate;

        // Guardamos los IDs en memoria
        ticketsReservados = ticketsLibres; 
        console.log("Tickets reservados temporalmente:", ticketsReservados);
        return true; // Éxito

    } catch (e) {
        console.error("Error al bloquear:", e);
        return false;
    }
}

// Liberar tickets (Si se acaba el tiempo o cancela)
async function liberarTickets() {
    if (ticketsReservados.length === 0) return;
    const ids = ticketsReservados.map(t => t.id);
    
    await supabaseClient
        .from('tickets')
        .update({ estado: 'disponible' })
        .in('id', ids);
    
    ticketsReservados = [];
    console.log("Tickets liberados.");
}

// --- 3. NAVEGACIÓN (nextStep) ---
window.nextStep = async function() {
    // Si estamos en el PASO 2 y vamos al 3 -> Intentamos Reservar
    if (currentStep === 2) {
        const btn = document.getElementById('btn-next');
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
        btn.disabled = true;

        const exitoReserva = await verificarYBloquearTickets();
        
        btn.innerHTML = textoOriginal;
        btn.disabled = false;

        if (!exitoReserva) return; // No avanza si falló la reserva
        
        iniciarTimer();
    }

    // Lógica normal de avance
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
        // Paso final -> Procesar Compra
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

// --- 5. PROCESO FINAL (CON PLAN B DE EMERGENCIA) ---
async function procesarCompraFinal() {
    const nombre = document.getElementById('input-name').value;
    const cedula = document.getElementById('input-cedula').value;
    const telefono = document.getElementById('input-country-code').value + document.getElementById('input-phone').value;
    const email = document.getElementById('input-email').value;
    const referencia = document.getElementById('input-referencia').value;
    const fileInput = document.getElementById('input-comprobante');
    const cantidad = parseInt(document.getElementById('custom-qty').value);
    
    // Validar monto y archivo
    let montoTexto = document.getElementById('step4-total').innerText;
    let montoFinal = parseFloat(montoTexto.replace('Bs.', '').replace(/\./g, '').replace(',', '.').trim());

    if (!fileInput.files.length) { Swal.fire('Error', 'Sube el comprobante', 'error'); return; }
    if (!referencia) { Swal.fire('Error', 'Ingresa la referencia', 'error'); return; }

    Swal.fire({ title: 'Procesando...', text: 'Registrando tu compra...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        // 1. Subir Imagen
        const urlImagen = await subirComprobante(fileInput.files[0]);

        // 2. Crear Orden
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

        // --- PLAN A vs PLAN B ---
        
        let idsFinales = [];
        let numerosFinales = [];

        // PLAN A: Usar los tickets que ya reservamos en el paso 2
        if (ticketsReservados.length === cantidad) {
            console.log("Usando tickets reservados previamente.");
            idsFinales = ticketsReservados.map(t => t.id);
            numerosFinales = ticketsReservados.map(t => t.numero);
        } 
        // PLAN B (Emergencia): Si la reserva falló o se perdió, buscar tickets nuevos AHORA
        else {
            console.warn("Reserva perdida. Buscando tickets de emergencia...");
            const { data: ticketsEmergencia, error: errEmergencia } = await supabaseClient
                .from('tickets')
                .select('id, numero')
                .eq('estado', 'disponible')
                .limit(cantidad);
                
            if (errEmergencia || !ticketsEmergencia || ticketsEmergencia.length < cantidad) {
                console.error("CRÍTICO: No se encontraron tickets ni de emergencia. La orden se creó sin tickets.");
                // Aquí permitimos continuar para no asustar al cliente, pero el admin deberá asignar manualmente.
            } else {
                idsFinales = ticketsEmergencia.map(t => t.id);
                numerosFinales = ticketsEmergencia.map(t => t.numero);
            }
        }

        // 3. ASIGNAR LOS TICKETS A LA ORDEN
        if (idsFinales.length > 0) {
            const { error: updateError } = await supabaseClient
                .from('tickets')
                .update({ 
                    estado: 'pendiente', // Pasan a pendiente de revisión
                    id_orden: ordenData.id 
                })
                .in('id', idsFinales);

            if (updateError) throw updateError;
        }

        // --- FINALIZACIÓN ---

        ticketsReservados = []; 
        clearInterval(intervaloTimer); 
        Swal.close();

        // Mostrar boletos en pantalla de éxito
        const container = document.getElementById('assigned-tickets');
        if(container && numerosFinales.length > 0) {
            container.innerHTML = numerosFinales.map(n => 
                `<span class="bg-red-100 text-red-700 font-bold px-3 py-1 rounded-lg text-sm border border-red-200">${n}</span>`
            ).join('');
        } else if (container) {
             container.innerHTML = `<span class="text-xs text-gray-500">Tu orden fue recibida. Tus boletos serán asignados por el administrador en breve.</span>`;
        }

        document.getElementById(`step-5`).classList.add('hidden');
        document.getElementById('modal-footer').classList.add('hidden');
        document.getElementById('step-success').classList.remove('hidden');
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });

    } catch (err) {
        console.error("Error final:", err);
        Swal.fire({ icon: 'error', title: 'Error', text: 'Ocurrió un error. Tu orden fue creada pero hubo un problema asignando los boletos. Contáctanos.' });
    }
}

// Liberar si cierra la ventana (Intento best-effort)
window.addEventListener('beforeunload', () => {
    if (ticketsReservados.length > 0) {
        // Lógica de liberación en cierre (opcional)
    }
});

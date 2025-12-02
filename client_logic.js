// client_logic.js - Lógica Completa de Compra y Reserva

// ⚠️ TUS CLAVES (No borrar)
const SUPABASE_URL = 'https://tpzuvrvjtxuvmyusjmpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwenV2cnZqdHh1dm15dXNqbXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NDMwMDAsImV4cCI6MjA4MDExOTAwMH0.YcGZLy7W92H0o0TN4E_v-2PUDtcSXhB-D7x7ob6TTp4';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables Globales
let ticketsReservados = []; // Aquí guardamos los IDs de los tickets que el cliente tiene "agarrados"
let intervaloTimer = null;

// --- FUNCIONES DE CARGA DE IMAGEN ---
async function subirComprobante(file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const { data, error } = await supabaseClient.storage.from('comprobantes').upload(fileName, file);
    if (error) throw error;
    const { data: { publicUrl } } = supabaseClient.storage.from('comprobantes').getPublicUrl(fileName);
    return publicUrl;
}

// --- LÓGICA DE RESERVA (BLOQUEO) ---

// 1. Verificar disponibilidad y bloquear tickets (Se llama al pasar al Paso 3)
async function verificarYBloquearTickets() {
    const cantidad = parseInt(document.getElementById('custom-qty').value) || 1;

    // A. Verificar Stock
    const { count, error: errCount } = await supabaseClient
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'disponible');

    if (errCount) {
        console.error("Error consultando stock:", errCount);
        Swal.fire({ icon: 'error', title: 'Error', text: 'No pudimos verificar la disponibilidad.' });
        return false;
    }

    // Si pide más de lo que hay
    if (count < cantidad) {
        Swal.fire({
            icon: 'warning',
            title: '¡Boletos Insuficientes!',
            text: `Solo quedan ${count} boletos disponibles. Por favor reduce la cantidad.`,
            confirmButtonColor: '#ef4444'
        });
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
            .update({ estado: 'bloqueado' }) // Agrega fecha si tienes columna fecha_bloqueo
            .in('id', ids);

        if (errUpdate) throw errUpdate;

        // Guardamos los IDs en memoria para usarlos al final
        ticketsReservados = ticketsLibres; 
        console.log("Tickets reservados temporalmente:", ticketsReservados);
        return true; // Éxito

    } catch (e) {
        console.error(e);
        return false;
    }
}

// 2. Liberar tickets (Si se acaba el tiempo o cancela)
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

// --- SOBREESCRIBIR LA NAVEGACIÓN (nextStep) ---
// Esta función reemplaza la lógica del botón "Continuar"
window.originalNextStep = window.nextStep; // Guardamos referencia por si acaso

window.nextStep = async function() {
    // Si estamos en el PASO 2 (Seleccionando cantidad) y vamos al 3
    if (currentStep === 2) {
        // Mostrar carga en el botón
        const btn = document.getElementById('btn-next');
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
        btn.disabled = true;

        const exitoReserva = await verificarYBloquearTickets();
        
        btn.innerHTML = textoOriginal;
        btn.disabled = false;

        if (!exitoReserva) return; // No avanza si falló
        
        // Si funcionó, iniciamos timer y avanzamos
        iniciarTimer();
    }

    // Lógica normal de avance visual (Copiar del HTML original logic)
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
        // Paso final (Procesar compra)
        procesarCompraFinal();
    }
}

// --- TEMPORIZADOR ---
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

// --- PROCESO FINAL ---
async function procesarCompraFinal() {
    const nombre = document.getElementById('input-name').value;
    const cedula = document.getElementById('input-cedula').value;
    const telefono = document.getElementById('input-country-code').value + document.getElementById('input-phone').value;
    const email = document.getElementById('input-email').value;
    const referencia = document.getElementById('input-referencia').value;
    const fileInput = document.getElementById('input-comprobante');
    const cantidad = parseInt(document.getElementById('custom-qty').value);
    
    // Validar monto
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
                estado: 'pendiente_validacion' // Esto la hará aparecer en el cuadro amarillo del admin
            }])
            .select()
            .single();

        if (ordenError) throw ordenError;

        // 3. ASIGNAR LOS TICKETS QUE YA TENÍAMOS RESERVADOS
        // En lugar de buscar nuevos, usamos `ticketsReservados`
        const ids = ticketsReservados.map(t => t.id);
        const numeros = ticketsReservados.map(t => t.numero);

        const { error: updateError } = await supabaseClient
            .from('tickets')
            .update({ 
                estado: 'pendiente', // Pasan de bloqueado a pendiente
                id_orden: ordenData.id 
            })
            .in('id', ids);

        if (updateError) throw updateError;

        // Éxito Total
        ticketsReservados = []; // Limpiamos la reserva porque ya son de la orden
        clearInterval(intervaloTimer); // Paramos el reloj
        Swal.close();

        // Mostrar Pantalla de Éxito
        const container = document.getElementById('assigned-tickets');
        if(container) {
            container.innerHTML = numeros.map(n => 
                `<span class="bg-red-100 text-red-700 font-bold px-3 py-1 rounded-lg text-sm border border-red-200">${n}</span>`
            ).join('');
        }

        document.getElementById(`step-5`).classList.add('hidden');
        document.getElementById('modal-footer').classList.add('hidden');
        document.getElementById('step-success').classList.remove('hidden');
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });

    } catch (err) {
        console.error("Error final:", err);
        Swal.fire({ icon: 'error', title: 'Error', text: 'Ocurrió un error procesando la orden. Contáctanos.' });
    }
}

// Si el usuario cierra la pestaña, intentamos liberar (no siempre funciona en todos los navegadores, pero ayuda)
window.addEventListener('beforeunload', () => {
    if (ticketsReservados.length > 0) {
        // Beacon API para liberar si cierra
        // Nota: Esto requiere backend o endpoint específico, por ahora confiamos en el timer o limpieza manual
        // Si quisieras ser estricto, aquí llamarías a liberarTickets(), pero debe ser síncrono o beacon.
    }
});

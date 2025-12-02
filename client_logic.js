// client_logic.js - VERSIÓN "INTERCEPTOR" (BLOQUEO TOTAL)

// ⚠️ TUS CLAVES
const SUPABASE_URL = 'https://tpzuvrvjtxuvmyusjmpq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwenV2cnZqdHh1dm15dXNqbXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NDMwMDAsImV4cCI6MjA4MDExOTAwMH0.YcGZLy7W92H0o0TN4E_v-2PUDtcSXhB-D7x7ob6TTp4';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// Variables Globales
let ticketsReservados = []; 
let intervaloTimer = null;
// Aseguramos que currentStep exista si no está definido externamente
if (typeof currentStep === 'undefined') { var currentStep = 1; }

// --- 1. FUNCIÓN DE VALIDACIÓN ESTRICTA ---
async function validarStockReal() {
    // Obtenemos el valor directamente del input
    const inputElement = document.getElementById('custom-qty');
    if (!inputElement) {
        console.error("No encuentro el input 'custom-qty'");
        return false;
    }

    const cantidadSolicitada = parseInt(inputElement.value, 10);
    console.log(`Verificando stock para: ${cantidadSolicitada} boletos...`);

    if (!cantidadSolicitada || cantidadSolicitada <= 0) {
        Swal.fire('Error', 'Selecciona al menos 1 boleto.', 'error');
        return false;
    }

    // Consulta a la Base de Datos (La verdad absoluta)
    const { count, error } = await supabaseClient
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'disponible');

    if (error) {
        console.error("Error Supabase:", error);
        Swal.fire('Error', 'Problema de conexión. Intenta de nuevo.', 'error');
        return false;
    }

    const stockReal = Number(count); // Forzamos a que sea número

    console.log(`Stock Real: ${stockReal} vs Solicitado: ${cantidadSolicitada}`);

    // --- EL BLOQUEO ---
    if (stockReal < cantidadSolicitada) {
        console.warn("BLOQUEO ACTIVADO: Stock insuficiente.");
        
        Swal.fire({
            icon: 'error', // Icono rojo fuerte
            title: '¡STOCK INSUFICIENTE!',
            html: `
                <div style="text-align: left; font-size: 1.1em;">
                    <p>⛔ <b>No puedes avanzar.</b></p>
                    <p>Pediste: <b style="color: red;">${cantidadSolicitada}</b></p>
                    <p>Solo quedan: <b style="color: green;">${stockReal}</b></p>
                    <br>
                    <small>Por favor reduce la cantidad para continuar.</small>
                </div>
            `,
            confirmButtonColor: '#d33',
            confirmButtonText: 'Entendido, corregiré',
            allowOutsideClick: false,
            allowEscapeKey: false
        });
        
        return false; // ESTO IMPIDE AVANZAR
    }

    // Si hay stock, intentamos bloquearlos (Reservar)
    return await reservarTicketsEnDB(cantidadSolicitada);
}

// Función auxiliar para marcar los tickets como 'bloqueado'
async function reservarTicketsEnDB(cantidad) {
    try {
        // Traer IDs disponibles
        const { data: ticketsLibres, error: errSelect } = await supabaseClient
            .from('tickets')
            .select('id, numero')
            .eq('estado', 'disponible')
            .limit(cantidad);

        // Doble verificación (por si alguien compró hace milisegundos)
        if (errSelect || !ticketsLibres || ticketsLibres.length < cantidad) {
            Swal.fire('Ups', 'Alguien te ganó los boletos en el último segundo. Intenta de nuevo.', 'warning');
            return false;
        }

        const ids = ticketsLibres.map(t => t.id);

        // Actualizar a bloqueado
        const { error: errUpdate } = await supabaseClient
            .from('tickets')
            .update({ estado: 'bloqueado' })
            .in('id', ids);

        if (errUpdate) throw errUpdate;

        ticketsReservados = ticketsLibres;
        console.log("Reserva exitosa:", ticketsReservados);
        return true;

    } catch (e) {
        console.error("Error reservando:", e);
        return false;
    }
}

// --- 2. SOBREESCRIBIR LA NAVEGACIÓN (EL INTERCEPTOR) ---

// Guardamos la referencia original por si acaso, pero vamos a ser agresivos
const funcionOriginalNext = window.nextStep;

window.nextStep = async function() {
    console.log(`Intentando avanzar desde el paso: ${currentStep}`);

    // === INTERCEPTOR DEL PASO 2 ===
    if (currentStep === 2) {
        const btn = document.getElementById('btn-next');
        if(btn) {
            var textoOriginal = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
            btn.disabled = true;
        }

        // 🛑 AQUÍ OCURRE EL FRENO
        const puedePasar = await validarStockReal();

        if(btn) {
            btn.innerHTML = textoOriginal;
            btn.disabled = false;
        }

        // Si la validación retornó FALSE, matamos la función aquí. NO AVANZA.
        if (!puedePasar) {
            console.log("AVANCE DETENIDO POR VALIDACIÓN.");
            return; 
        }

        // Si pasó, iniciamos timer
        iniciarTimer();
    }

    // Lógica estándar de avance (solo se ejecuta si no retornamos antes)
    if (currentStep < 5) {
        // Manejo visual de pasos
        if(currentStep === 4) {
            document.getElementById('payment-instructions').classList.remove('hidden');
            return; 
        }
        
        const pasoActualEl = document.getElementById(`step-${currentStep}`);
        const pasoSiguienteEl = document.getElementById(`step-${currentStep + 1}`);
        
        if (pasoActualEl) pasoActualEl.classList.add('hidden');
        if (pasoSiguienteEl) pasoSiguienteEl.classList.remove('hidden');
        
        currentStep++;
        console.log(`Avanzamos al paso ${currentStep}`);
        
        if (typeof updateModalHeader === 'function') updateModalHeader();
        
    } else {
        procesarCompraFinal();
    }
};


// --- 3. RESTO DE FUNCIONES (Timer, Upload, Compra Final) ---

function iniciarTimer() {
    clearInterval(intervaloTimer);
    let timeLeft = 900; // 15 minutos
    const timerContainer = document.getElementById('timer-container');
    if(timerContainer) timerContainer.classList.remove('hidden');
    
    intervaloTimer = setInterval(() => {
        let min = Math.floor(timeLeft / 60);
        let sec = timeLeft % 60;
        sec = sec < 10 ? '0' + sec : sec;
        const countEl = document.getElementById('countdown');
        if(countEl) countEl.innerText = `${min}:${sec}`;

        if (timeLeft <= 0) {
            clearInterval(intervaloTimer);
            liberarTickets();
            Swal.fire({
                icon: 'error',
                title: 'Tiempo Agotado',
                text: 'La reserva ha expirado.',
                confirmButtonText: 'Reiniciar'
            }).then(() => location.reload());
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
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const { error } = await supabaseClient.storage.from('comprobantes').upload(fileName, file);
    if (error) throw error;
    const { data: { publicUrl } } = supabaseClient.storage.from('comprobantes').getPublicUrl(fileName);
    return publicUrl;
}

async function procesarCompraFinal() {
    // Recolección de datos
    const nombre = document.getElementById('input-name')?.value;
    const cedula = document.getElementById('input-cedula')?.value;
    const telefono = (document.getElementById('input-country-code')?.value || '') + (document.getElementById('input-phone')?.value || '');
    const email = document.getElementById('input-email')?.value;
    const referencia = document.getElementById('input-referencia')?.value;
    const fileInput = document.getElementById('input-comprobante');
    const cantidad = parseInt(document.getElementById('custom-qty')?.value || 0);
    
    let montoTexto = document.getElementById('step4-total')?.innerText || '0';
    let montoFinal = parseFloat(montoTexto.replace('Bs.', '').replace(/\./g, '').replace(',', '.').trim());

    if (!fileInput?.files.length) { Swal.fire('Error', 'Sube el comprobante', 'error'); return; }
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

        // Asignar Tickets (Usando los reservados en Paso 2)
        if (ticketsReservados.length === cantidad) {
            const idsFinales = ticketsReservados.map(t => t.id);
            const numerosFinales = ticketsReservados.map(t => t.numero);

            const { error: updateError } = await supabaseClient
                .from('tickets')
                .update({ estado: 'pendiente', id_orden: ordenData.id })
                .in('id', idsFinales);

            if (updateError) throw updateError;

            // Éxito
            ticketsReservados = [];
            clearInterval(intervaloTimer);
            Swal.close();

            // Mostrar resultado
            const container = document.getElementById('assigned-tickets');
            if(container) {
                container.innerHTML = numerosFinales.map(n => 
                    `<span class="bg-red-100 text-red-700 font-bold px-3 py-1 rounded-lg text-sm border border-red-200">${n}</span>`
                ).join('');
            }

            document.getElementById('step-5').classList.add('hidden');
            document.getElementById('modal-footer').classList.add('hidden');
            document.getElementById('step-success').classList.remove('hidden');
            confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });

        } else {
            throw new Error(`Error CRÍTICO: Reservados (${ticketsReservados.length}) no coincide con solicitados (${cantidad})`);
        }

    } catch (err) {
        console.error("Error final:", err);
        Swal.fire({ icon: 'error', title: 'Error', text: 'Error técnico al asignar boletos. Tu orden fue creada, contacta soporte.' });
    }
}

// Inicialización de seguridad al cargar la página
window.onload = async function() {
    try {
        const { count } = await supabaseClient.from('tickets').select('*', { count: 'exact', head: true }).eq('estado', 'disponible');
        console.log(`Carga inicial: ${count} disponibles.`);
        if (count === 0) {
            const btns = document.querySelectorAll('#btn-next, button[onclick="abrirModalCompra()"]');
            btns.forEach(b => { b.disabled = true; b.innerHTML = "AGOTADO"; });
        }
    } catch(e) { console.error(e); }
};

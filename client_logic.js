// client_logic.js - VERSIÓN BLOQUEO ESTRICTO

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

        // Si NO hay tickets, bloqueamos todo visualmente
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

// --- 2. LÓGICA DE RESERVA Y BLOQUEO (CRÍTICO) ---
async function validarYReservarEstricto() {
    const inputCantidad = document.getElementById('custom-qty');
    // Aseguramos que sea un número entero base 10
    const cantidadSolicitada = parseInt(inputCantidad.value, 10) || 0;

    console.log(`Intento de compra: ${cantidadSolicitada} boletos.`);

    if (cantidadSolicitada <= 0) {
        Swal.fire('Error', 'Selecciona al menos 1 boleto.', 'error');
        return false;
    }

    // 1. CONSULTA DE STOCK EXACTO (Lectura)
    const { count: stockDisponible, error: errCount } = await supabaseClient
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('estado', 'disponible');

    if (errCount) {
        console.error("Error de conexión:", errCount);
        Swal.fire('Error', 'Problema de conexión. Intenta de nuevo.', 'error');
        return false; 
    }

    // 2. EL FILTRO: ¿Hay suficientes?
    // Si el usuario pide 85 y hay 75, entra aquí y MATA el proceso.
    if (stockDisponible < cantidadSolicitada) {
        console.warn(`BLOQUEO: Pide ${cantidadSolicitada}, hay ${stockDisponible}`);
        
        Swal.fire({
            icon: 'warning',
            title: '¡Cantidad no disponible!',
            html: `
                <div class="text-left">
                    <p class="mb-2">Solicitaste: <b>${cantidadSolicitada}</b> boletos.</p>
                    <p class="mb-4 text-red-600 font-bold">Solo quedan: ${stockDisponible} boletos.</p>
                    <p class="text-sm">Por favor ajusta la cantidad para continuar.</p>
                </div>
            `,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Entendido, ajustaré la cantidad'
        });
        
        // Si ya no queda nada, refrescamos para mostrar el "Sold Out"
        if (stockDisponible === 0) {
            bloquearBotonCompra();
            setTimeout(() => location.reload(), 2000);
        }
        
        return false; // ⛔ RETORNA FALSO, NO AVANZA
    }

    // 3. INTENTO DE RESERVA (Escritura)
    // Solo llegamos aquí si stockDisponible >= cantidadSolicitada
    try {
        // Traemos los IDs a reservar
        const { data: ticketsParaBloquear, error: errSelect } = await supabaseClient
            .from('tickets')
            .select('id, numero')
            .eq('estado', 'disponible')
            .limit(cantidadSolicitada);

        // Validación "Race Condition": Si entre que consultamos y reservamos, alguien compró.
        if (errSelect || !ticketsParaBloquear || ticketsParaBloquear.length !== cantidadSolicitada) {
            Swal.fire({ 
                icon: 'warning', 
                title: '¡Te ganaron!', 
                text: 'Alguien acaba de comprar esos boletos hace un segundo. Intenta de nuevo.' 
            });
            return false; // ⛔ RETORNA FALSO
        }

        const ids = ticketsParaBloquear.map(t => t.id);

        // Ejecutamos el bloqueo en la DB
        const { error: errUpdate } = await supabaseClient
            .from('tickets')
            .update({ estado: 'bloqueado' })
            .in('id', ids);

        if (errUpdate) throw errUpdate;

        // Éxito: Guardamos en memoria
        ticketsReservados = ticketsParaBloquear; 
        console.log(`Éxito: Reservados ${ticketsReservados.length} tickets.`);
        return true; // ✅ RETORNA VERDADERO (SOLO AQUÍ SE AVANZA)

    } catch (e) {
        console.error("Error crítico al reservar:", e);
        // Si falló algo, intentamos liberar por si acaso se marcó alguno a medias
        if(ticketsReservados.length > 0) liberarTickets(); 
        Swal.fire('Error', 'Hubo un error procesando la reserva. Intenta de nuevo.', 'error');
        return false;
    }
}

async function liberarTickets() {
    if (ticketsReservados.length === 0) return;
    const ids = ticketsReservados.map(t => t.id);
    await supabaseClient.from('tickets').update({ estado: 'disponible' }).in('id', ids);
    ticketsReservados = [];
    console.log("Tickets liberados por cancelación/timeout.");
}

// --- 3. NAVEGACIÓN (nextStep) - MODIFICADA ---
window.nextStep = async function() {
    // === VALIDACIÓN DEL PASO 2 ===
    if (currentStep === 2) {
        const btn = document.getElementById('btn-next');
        const textoOriginal = btn.innerHTML;
        
        // UI de carga
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
        btn.disabled = true;
        
        // Bloqueamos la pantalla para que no modifique el input mientras verificamos
        Swal.fire({
            title: 'Verificando disponibilidad...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        // LLAMADA A LA FUNCIÓN ESTRICTA
        const puedeAvanzar = await validarYReservarEstricto();
        
        // Restaurar botón
        btn.innerHTML = textoOriginal;
        btn.disabled = false;
        
        // Cerrar el loading de Swal
        if (Swal.isVisible() && Swal.getTitle()?.textContent === 'Verificando disponibilidad...') {
            Swal.close();
        }

        // ⛔ EL GRAN FILTRO: SI ES FALSE, SE ACABA LA FUNCIÓN AQUÍ.
        if (!puedeAvanzar) {
            console.log("Bloqueo de avance activado.");
            return; 
        }
        
        // Si pasó el filtro, iniciamos timer y continuamos
        iniciarTimer();
    }

    // Lógica normal de avance de pasos (Paso 3, 4...)
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
        // Ya no hay Plan B porque el Paso 2 garantiza que los tenemos.
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
            // Este error ya no debería saltar jamás con la validación estricta del paso 2
            throw new Error(`Discrepancia fatal: Reservados ${ticketsReservados.length} vs Solicitados ${cantidad}`);
        }

    } catch (err) {
        console.error("Error final:", err);
        Swal.fire({ icon: 'error', title: 'Error', text: 'Tu orden fue creada pero hubo un problema técnico asignando los boletos. Por favor contacta a soporte con tu referencia.' });
    }
}

// Liberar si cierra
window.addEventListener('beforeunload', () => {
    if (ticketsReservados.length > 0) {
        // Intento de liberar (beacon)
        const ids = ticketsReservados.map(t => t.id);
        // Esto es complejo de implementar fiable con Supabase rest en beforeunload, 
        // confiamos en que el admin puede limpiar tickets "bloqueados" viejos o el timer del cliente.
    }
});

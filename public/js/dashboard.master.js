/**
 * =========================================================
 * dashboard.master.js
 * =========================================================
 * Controlador maestro del Dashboard Financiero (Frontend)
 *
 * Este archivo centraliza:
 * - El estado global de filtros del dashboard
 * - La comunicación con el backend analítico (API REST)
 * - El procesamiento de datos recibidos
 * - La actualización reactiva de la interfaz de usuario
 *
 * Actúa como capa de orquestación entre:
 * - UI (HTML / CSS)
 * - Backend analítico (Express + DuckDB)
 * - Módulos especializados (gráficas, tendencias)
 *
 * =========================================================
 * Versión: 1.0.0
 * =========================================================
 */

/** MTI JERM
 * =========================================================
 * 1. CONFIGURACIÓN GENERAL
 * =========================================================
 */

/**
 * Prefijo base para todos los endpoints del backend.
 * Permite cambiar el contexto de la API sin modificar
 * cada llamada individual.
 */
const API = '/api';

/**
 * =========================================================
 * 2. ESTADO GLOBAL DE FILTROS
 * =========================================================
 *
 * Este objeto representa el estado único de los filtros
 * activos del dashboard.
 *
 * Es utilizado por:
 * - KPIs
 * - Indicadores financieros
 * - Gráficas
 *
 * Cualquier cambio en este objeto dispara una recarga
 * coordinada de los datos.
 */
let filtros = {
  estatus: '',
  fechaDesde: '',
  fechaHasta: ''
};

// ---------------------------------------------------------
// 3. HELPERS DE FORMATO (Localización es-MX)
// ---------------------------------------------------------

/**
 * Convierte valores numéricos a formato monetario MXN.
 * Se utiliza para todos los importes financieros mostrados
 * en la interfaz.
 *
 * @param {number|string} n Valor numérico
 * @returns {string} Monto formateado como moneda
 */
function fmtMoney(n) {
  return '$' + Number(n || 0).toLocaleString('es-MX', {
    minimumFractionDigits: 2
  });
}

/**
 * Formatea números enteros con separadores de miles.
 * Ideal para contadores y métricas generales.
 *
 * @param {number|string} n Valor numérico
 * @returns {string} Número formateado
 */
function fmtNumber(n) {
  return Number(n || 0).toLocaleString('es-MX');
}

/**
 * Convierte valores numéricos a porcentaje con dos decimales.
 *
 * @param {number|string} n Valor numérico
 * @returns {string} Representación porcentual
 */
function fmtPercent(n) {
  return Number(n || 0).toFixed(2) + ' %';
}

// ---------------------------------------------------------
// 4. CAPA DE COMUNICACIÓN CON EL BACKEND
// ---------------------------------------------------------

/**
 * Ejecuta una petición GET a la API, inyectando
 * automáticamente los filtros activos como parámetros
 * de consulta.
 *
 * Funciones adicionales:
 * - Mide la latencia de la consulta
 * - Actualiza el indicador técnico de tiempo de respuesta
 * - Maneja errores de red o HTTP
 *
 * @async
 * @param {string} endpoint Ruta del recurso (ej. '/kpis-sidebar')
 * @returns {Promise<Object>} Respuesta JSON del backend
 */
// CORRECCIÓN: getData acepta parámetros extra opcionales (ej. { pagina: 2 })
// que se suman a los filtros; así la tabla de tarjetas puede paginar.
async function getData(endpoint, extra = {}) {
  const params = new URLSearchParams({ ...filtros, ...extra });
  const url = `${API}${endpoint}?${params}`;

  try {
    const start = performance.now();
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error('HTTP ' + res.status);
    }

    const data = await res.json();

    // Telemetría: medición de latencia DuckDB
    const end = performance.now();
    const latencyEl = document.getElementById('dbLatency');
    if (latencyEl) {
      latencyEl.textContent = (end - start).toFixed(0) + ' ms';
    }

    return data;
  } catch (err) {
    console.error('Error en fetch:', err);
    return {};
  }
}

// ---------------------------------------------------------
// 5. CARGA Y RENDERIZADO DE KPIs
// ---------------------------------------------------------

/**
 * Carga los KPIs globales del sistema y los renderiza
 * en el panel lateral.
 *
 * Nota:
 * Estos indicadores suelen ser históricos y no dependen
 * directamente de los filtros de fecha.
 */
async function cargarKPIsSidebar() {
  const d = await getData('/kpis-sidebar');

  if (document.getElementById('kpiClientes')) {
    document.getElementById('kpiClientes').textContent = fmtNumber(d.clientes);
  }

  if (document.getElementById('kpiEmpleados')) {
    document.getElementById('kpiEmpleados').textContent = fmtNumber(d.empleados);
  }

  if (document.getElementById('kpiSucursales')) {
    document.getElementById('kpiSucursales').textContent = fmtNumber(d.sucursales);
  }

  if (document.getElementById('kpiTasa')) {
    document.getElementById('kpiTasa').textContent = fmtPercent(d.tasa_promedio);
  }

  if (document.getElementById('kpiCreditoPromedio')) {
    document.getElementById('kpiCreditoPromedio').textContent = fmtMoney(d.credito_promedio);
  }
}

/**
 * =========================================================
 * 6. INDICADORES FINANCIEROS PRINCIPALES
 * =========================================================
 */

/**
 * Actualiza las tarjetas financieras principales:
 * - Colocación
 * - Cobranza
 * - Saldos pendientes
 *
 * Se ejecuta automáticamente cada vez que cambian
 * los filtros globales.
 */
async function cargarFinancieros() {
  const d = await getData('/indicadores-financieros');

  /**
   * Helper interno para inserción segura de texto
   * en el DOM (evita errores por elementos inexistentes).
   */
  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  // Bloque: Colocación
  setTxt('colocadoCredito', fmtMoney(d.colocado_credito));
  setTxt('colocadoIntereses', fmtMoney(d.colocado_intereses));
  setTxt('colocadoComisiones', fmtMoney(d.colocado_comisiones));

  // Bloque: Cobranza
  setTxt('cobradoCredito', fmtMoney(d.cobrado_credito));
  setTxt('cobradoIntereses', fmtMoney(d.cobrado_intereses));
  setTxt('cobradoComisiones', fmtMoney(d.cobrado_comisiones));

  // Bloque: Saldos pendientes
  setTxt('saldoCredito', fmtMoney(d.saldo_credito));
  setTxt('saldoIntereses', fmtMoney(d.saldo_intereses));
  setTxt('saldoComisiones', fmtMoney(d.saldo_comisiones));
}

// ---------------------------------------------------------
// 7. GESTIÓN DE FILTROS
// ---------------------------------------------------------

/**
 * Actualiza el filtro por estatus de crédito.
 * También sincroniza el estado visual de los botones.
 *
 * @param {string} estatus Estatus seleccionado
 */
function setEstatus(estatus) {
  filtros.estatus = estatus;

  document.querySelectorAll('#estatusButtons button').forEach(b => {
    /**
     * CORRECCIÓN: antes se comparaba b.textContent === estatus,
     * pero el botón "Atrasado" envía el valor 'Atraso', por lo que
     * nunca se marcaba como activo. Ahora se compara contra el valor
     * real enviado en el atributo onclick del botón.
     */
    const valorBoton = (b.getAttribute('onclick') || '')
      .replace(/^setEstatus\('/, '')
      .replace(/'\)$/, '');

    const esActivo = valorBoton === estatus;

    b.className = esActivo ? 'active' : '';
  });

  recargarTodo();
}

/**
 * Lee los valores de fecha desde el DOM y
 * actualiza el estado global de filtros.
 */
function actualizarFechas() {
  filtros.fechaDesde = document.getElementById('fechaDesde').value;
  filtros.fechaHasta = document.getElementById('fechaHasta').value;
  recargarTodo();
}

/**
 * Coordina la recarga de todos los componentes
 * dependientes de los filtros.
 *
 * Optimización:
 * - Las gráficas solo se recargan si la pestaña
 *   correspondiente está activa.
 */
function recargarTodo() {
  console.log('Recargando datos con filtros:', filtros);

  cargarFinancieros();

  const tabTrends = document.getElementById('tabTendencias');
  if (tabTrends && tabTrends.classList.contains('active')) {
    if (typeof cargarGraficasTendencias === 'function') {
      cargarGraficasTendencias();
    }
  }
  
  const tabSaldosTarjetas = document.getElementById('tabSaldosTarjetas');
  if (tabSaldosTarjetas && tabSaldosTarjetas.classList.contains('active')) {
    cargarResumenSaldosTarjetas();
  }
  
  const tabGraficasTarjetas = document.getElementById('tabGraficasTarjetas');
  if (tabGraficasTarjetas && tabGraficasTarjetas.classList.contains('active')) {
    cargarGraficasTarjetasCredito();
  }
}

// ---------------------------------------------------------
// 8. NAVEGACIÓN ENTRE PESTAÑAS
// ---------------------------------------------------------

/**
 * Controla la visibilidad de secciones tipo tab.
 * Implementa carga diferida (lazy loading) para gráficas.
 *
 * @param {Event} evt Evento de click
 * @param {string} tabName ID del contenedor a mostrar
 */
function openTab(evt, tabName) {
  const tabcontent = document.getElementsByClassName('tab-content');
  for (let i = 0; i < tabcontent.length; i++) {
    tabcontent[i].classList.remove('active');
  }

  const tablinks = document.getElementsByClassName('tab-button');
  for (let i = 0; i < tablinks.length; i++) {
    tablinks[i].classList.remove('active');
  }

  document.getElementById(tabName).classList.add('active');
  if (evt && evt.currentTarget) {
    evt.currentTarget.classList.add('active');
  }

 // --OCULTAR BOTONES DE ESTATUS EN APARTADOS DE TARJETA
 
 const contenedorEstatus = document.getElementById('estatusButtons');
  
 const esPestanaTarjetas = tabName === 'tabSaldosTarjetas' || tabName === 'tabGraficasTarjetas';

  if (contenedorEstatus) {
    if (esPestanaTarjetas) {
      contenedorEstatus.style.display = 'none';
      
      filtros.estatus = ''; 
      
    } else {
      contenedorEstatus.style.display = 'block'; 
    }
  }
  
  // --FIN DE CODIGO OCULTAR BOTONES DE ESTATUS
  
    if (tabName === 'tabTendencias') {
    if (typeof cargarGraficasTendencias === 'function') {
      cargarGraficasTendencias();
    } else {
      console.error('dashboard.trends.js no está cargado.');
    }
  }

  if (tabName === 'tabSaldosTarjetas') {
    // CORRECCIÓN: ya no se muestra la tabla; solo se cargan los tableros.
    // cargarTarjetasCredito();
    cargarResumenSaldosTarjetas();
  }

  if (tabName === 'tabGraficasTarjetas') {
    cargarGraficasTarjetasCredito();
  }
}
  
// CORRECCIÓN: aquí había una llave "}" sobrante que causaba un
// error de sintaxis y detenía la ejecución de todo el archivo.

// ---------------------------------------------------------
// 9. INICIALIZACIÓN DEL DASHBOARD
// ---------------------------------------------------------

/**
 * Punto de entrada principal del sistema.
 * Sincroniza filtros iniciales y ejecuta la
 * primera carga de datos.
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('Dashboard maestro inicializado');

  filtros.fechaDesde = document.getElementById('fechaDesde').value;
  filtros.fechaHasta = document.getElementById('fechaHasta').value;

  document.getElementById('fechaDesde').addEventListener('change', actualizarFechas);
  document.getElementById('fechaHasta').addEventListener('change', actualizarFechas);

  cargarKPIsSidebar();
  cargarFinancieros();
});


// ---------------------------------------------------------
// 10. TARJETAS DE CRÉDITO: TABLA Y RESUMEN
// ---------------------------------------------------------

// CORRECCIÓN: estado de la paginación de la tabla de tarjetas
// (la tabla tiene 18,684 registros; se muestran por páginas).
const TARJETAS_POR_PAGINA = 100;
let paginaTarjetas = 1;
const HOY_ISO = new Date().toISOString().slice(0, 10);

/**
 * CORRECCIÓN: convierte 'YYYY-MM-DD' a 'DD/MM/YYYY' para la tabla.
 */
function fmtFecha(f) {
  if (!f) return '';
  const [a, m, d] = String(f).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/**
 * Carga las tarjetas de crédito desde DuckDB
 * y construye las filas de la tabla HTML.
 *
 * @route GET /api/tarjetas-creditos
 */
async function cargarTarjetasCredito(pagina = 1) {
  const contenedor = document.getElementById('tablaTarjetasCredito');

  if (!contenedor) return;

  contenedor.innerHTML = `
    <tr>
      <td colspan="9">Cargando tarjetas de crédito...</td>
    </tr>
  `;

  // CORRECCIÓN: se pide solo la página actual (ver API 4 en server.js).
  paginaTarjetas = pagina;
  const tarjetas = await getData('/tarjetas-creditos', {
    pagina,
    porPagina: TARJETAS_POR_PAGINA
  });

  if (!Array.isArray(tarjetas)) {
    contenedor.innerHTML = `
      <tr>
        <td colspan="9">No fue posible cargar las tarjetas.</td>
      </tr>
    `;
    return;
  }

  if (tarjetas.length === 0) {
    contenedor.innerHTML = `
      <tr>
        <td colspan="9">No hay tarjetas registradas.</td>
      </tr>
    `;
    actualizarResumenTarjetas({
      total_tarjetas: 0,
      limite_total: 0,
      saldo_total: 0,
      disponible_total: 0
    });
    return;
  }

  contenedor.innerHTML = tarjetas.map(t => {
    const numero = String(t.num_tarjeta ?? '');
    const numeroSeguro = numero.replace(/[&<>"']/g, caracter => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[caracter]);

    const estatus = String(t.estatus || 'Sin estatus');
    const estatusSeguro = estatus.replace(/[&<>"']/g, caracter => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[caracter]);

    // CORRECCIÓN: las fechas de vencimiento ya pasadas se marcan en rojo.
    const vencida = String(t.fecha_vencimiento ?? '').slice(0, 10) < HOY_ISO;

    return `
      <tr>
        <td>${t.id_tarjeta ?? ''}</td>
        <td>${numeroSeguro}</td>
        <td>${t.id_cliente ?? ''}</td>
        <td>${fmtMoney(t.limite_credito)}</td>
        <td>${fmtMoney(t.saldo_actual)}</td>
        <td>${fmtMoney(t.credito_disponible)}</td>
        <td>${fmtFecha(t.fecha_emision)}</td>
        <td style="${vencida ? 'color:#dc2626; font-weight:600;' : ''}">${fmtFecha(t.fecha_vencimiento)}</td>
        <td>${estatusSeguro}</td>
      </tr>
    `;
  }).join('');

  // CORRECCIÓN: dibuja los botones Anterior / Siguiente.
  actualizarPaginadorTarjetas(pagina);
}


/**
 * CORRECCIÓN: dibuja el paginador de la tabla de tarjetas.
 * El total de tarjetas sale del endpoint de resumen.
 */
async function actualizarPaginadorTarjetas(pagina) {
  const cont = document.getElementById('paginadorTarjetas');
  if (!cont) return;

  const r = await getData('/graficas/tarjetas-creditos');
  const total = Number(r && r.resumen ? r.resumen.total_tarjetas : 0);
  const paginas = Math.max(1, Math.ceil(total / TARJETAS_POR_PAGINA));

  // CORRECCIÓN: con el mismo resumen se llenan las tarjetas superiores.
  actualizarCardsSaldos(r && r.resumen ? r.resumen : {});

  cont.innerHTML = `
    <button onclick="cargarTarjetasCredito(${pagina - 1})" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
    <span>Página ${fmtNumber(pagina)} de ${fmtNumber(paginas)} (${fmtNumber(total)} tarjetas)</span>
    <button onclick="cargarTarjetasCredito(${pagina + 1})" ${pagina >= paginas ? 'disabled' : ''}>Siguiente →</button>
  `;
}


/**
 * CORRECCIÓN: carga los totales de tarjetas y llena los tableros de la
 * pestaña de saldos (sin tabla).
 */
async function cargarResumenSaldosTarjetas() {
  const r = await getData('/graficas/tarjetas-creditos');

  if (!r || !r.resumen) {
    console.error('No se pudieron cargar los datos de tarjetas.');
    return;
  }

  actualizarCardsSaldos(r.resumen);
}

/**
 * CORRECCIÓN: llena las 3 tarjetas superiores de la pestaña de saldos
 * (mismo diseño que "Indicadores Financieros").
 */
function actualizarCardsSaldos(d) {
  const total = Number(d.total_tarjetas || 0);
  const limite = Number(d.limite_total || 0);
  const saldo = Number(d.saldo_total || 0);
  const disponible = Number(d.disponible_total || 0);

  // Helpers para evitar división entre cero
  const prom = v => (total > 0 ? v / total : 0);
  const pct = v => (limite > 0 ? (v / limite) * 100 : 0);

  const asignaciones = {
    saldosLimite: fmtMoney(limite),
    saldosTarjetas: fmtNumber(total),
    saldosLimitePromedio: fmtMoney(prom(limite)),
    saldosUtilizado: fmtMoney(saldo),
    saldosPctUtilizado: fmtPercent(pct(saldo)),
    saldosSaldoPromedio: fmtMoney(prom(saldo)),
    saldosDisponible: fmtMoney(disponible),
    saldosPctDisponible: fmtPercent(pct(disponible)),
    saldosDisponiblePromedio: fmtMoney(prom(disponible))
  };

  Object.entries(asignaciones).forEach(([id, valor]) => {
    const elemento = document.getElementById(id);
    if (elemento) elemento.textContent = valor;
  });
}


/**
 * Actualiza las tarjetas resumen de crédito.
 */
function actualizarResumenTarjetas(d) {
  const asignaciones = {
    totalTarjetas: fmtNumber(d.total_tarjetas),
    limiteTotalTarjetas: fmtMoney(d.limite_total),
    saldoTotalTarjetas: fmtMoney(d.saldo_total),
    disponibleTotalTarjetas: fmtMoney(d.disponible_total)
  };

  Object.entries(asignaciones).forEach(([id, valor]) => {
    const elemento = document.getElementById(id);
    if (elemento) elemento.textContent = valor;
  });
}


// ---------------------------------------------------------
// 6.2. TARJETAS DE CRÉDITO: GRÁFICAS
// ---------------------------------------------------------

let chartLimitesTarjetas = null;
let chartEstatusTarjetas = null;

/**
 * Carga los totales de tarjetas y crea las gráficas
 * con Chart.js.
 */
async function cargarGraficasTarjetasCredito() {
  const d = await getData('/graficas/tarjetas-creditos');

  if (!d || !d.resumen || !Array.isArray(d.estatus)) {
    console.error('No se pudieron cargar los datos de tarjetas.');
    return;
  }

  actualizarResumenTarjetas(d.resumen);

  // Gráfica de límite total contra saldo utilizado.
  const canvasLimites = document.getElementById('chartLimitesTarjetas');

  if (canvasLimites) {
    if (chartLimitesTarjetas) {
      chartLimitesTarjetas.destroy();
    }

    chartLimitesTarjetas = new Chart(canvasLimites, {
      type: 'bar',
      data: {
        labels: ['Límite de crédito', 'Saldo utilizado', 'Disponible'],
        datasets: [{
          label: 'Monto en MXN',
          data: [
            Number(d.resumen.limite_total || 0),
            Number(d.resumen.saldo_total || 0),
            Number(d.resumen.disponible_total || 0)
          ],
          backgroundColor: ['#2563eb', '#d97706', '#059669'],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: context => fmtMoney(context.raw)
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: value =>
                '$' + Number(value).toLocaleString('es-MX')
            }
          }
        }
      }
    });
  }

  // Gráfica de cantidad de tarjetas por estatus.
  const canvasEstatus = document.getElementById('chartEstatusTarjetas');

  if (canvasEstatus) {
    if (chartEstatusTarjetas) {
      chartEstatusTarjetas.destroy();
    }

    chartEstatusTarjetas = new Chart(canvasEstatus, {
      type: 'doughnut',
      data: {
        labels: d.estatus.map(item => item.estatus),
        datasets: [{
          label: 'Tarjetas',
          data: d.estatus.map(item => Number(item.cantidad_tarjetas || 0)),
          backgroundColor: [
            '#2563eb',
            '#059669',
            '#d97706',
            '#dc2626',
            '#7c3aed',
            '#64748b'
          ]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false
      }
    });
  }
}

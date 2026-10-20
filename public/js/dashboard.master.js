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
async function getData(endpoint) {
  const params = new URLSearchParams(filtros);
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
    const esActivo =
      (estatus === '' && b.textContent === 'Todos') ||
      (b.textContent === estatus);

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

  if (tabName === 'tabTendencias') {
    if (typeof cargarGraficasTendencias === 'function') {
      cargarGraficasTendencias();
    } else {
      console.error('dashboard.trends.js no está cargado.');
    }
  }
}

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

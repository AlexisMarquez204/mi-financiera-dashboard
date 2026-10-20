/**
 * =========================================================
 * dashboard.trends.js
 * =========================================================
 * Motor de visualización del Dashboard Financiero
 *
 * Este archivo es responsable de:
 * - La creación y destrucción controlada de gráficas Chart.js
 * - La orquestación de consultas analíticas para visualización
 * - El renderizado optimizado de etiquetas personalizadas
 * - La sincronización de gráficas con los filtros activos
 *
 * Se integra con:
 * - dashboard.master.js (orquestador general)
 * - API REST (Express + DuckDB)
 * - Chart.js (motor de visualización)
 * - MTI JERM
 * =========================================================
 */

/**
 * =========================================================
 * 1. GESTIÓN DE INSTANCIAS DE GRÁFICAS
 * =========================================================
 *
 * Cada variable mantiene una referencia a la instancia
 * activa de Chart.js.
 *
 * Antes de renderizar una nueva gráfica:
 * - La instancia previa se destruye explícitamente
 * - Se evita fuga de memoria y renderizados duplicados
 */
let chartEvolucion = null;
let chartRoi = null;
let chartSucursales = null;
let chartPastel = null;

// ---------------------------------------------------------
// 2. PLUGIN DE ETIQUETAS PERSONALIZADAS (Canvas API)
// ---------------------------------------------------------

/**
 * Plugin personalizado de Chart.js para dibujar etiquetas
 * directamente sobre el canvas.
 *
 * Motivo de implementación propia:
 * - Evitar dependencias externas adicionales
 * - Control total sobre posicionamiento y formato
 * - Mejor rendimiento en dashboards con múltiples gráficas
 *
 * El plugin:
 * - Detecta orientación de la gráfica
 * - Ajusta formato según tipo de dato (ROI vs montos)
 * - Omite valores cero para reducir ruido visual
 */
const datalabelsPlugin = {
  id: 'customDataLabels',

  /**
   * Hook ejecutado después de renderizar los datasets.
   * Permite acceso directo al contexto 2D del canvas.
   */
  afterDatasetsDraw(chart) {
    const { ctx } = chart;

    // Detección de orientación y tipo de gráfica
    const isHorizontal = chart.options.indexAxis === 'y';
    const isRoi = chart.canvas.id === 'chartRoi';

    chart.data.datasets.forEach((dataset, i) => {
      const meta = chart.getDatasetMeta(i);
      if (meta.hidden) return;

      meta.data.forEach((element, index) => {
        let value = dataset.data[index];
        if (value === null || value === undefined) return;

        // En gráficas financieras se omiten ceros
        if (!isRoi && value === 0) return;

        /**
         * Formateo de etiqueta:
         * - ROI: porcentaje
         * - Montos: formato compacto (miles)
         */
        let label = '';
        if (isRoi) {
          label = value + '%';
        } else {
          label =
            value >= 1000
              ? '$' + (value / 1000).toFixed(1) + 'k'
              : '$' + value;
        }

        // Configuración visual del texto
        ctx.save();
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.fillStyle = '#334155';

        /**
         * Posicionamiento:
         * - Barras horizontales: texto lateral
         * - Barras verticales y líneas: texto rotado
         */
        if (isHorizontal) {
          const x = element.x + 5;
          const y = element.y;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, x, y);
        } else {
          const x = element.x;
          const y = element.y - 8;
          ctx.translate(x, y);
          ctx.rotate(-Math.PI / 2);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, 0, 0);
        }

        ctx.restore();
      });
    });
  }
};

/**
 * Registro global del plugin.
 * Se valida la existencia de Chart para evitar errores
 * en caso de carga parcial del frontend.
 */
if (typeof Chart !== 'undefined') {
  Chart.register(datalabelsPlugin);
}

// ---------------------------------------------------------
// 3. ORQUESTADOR DE CARGA DE GRÁFICAS
// ---------------------------------------------------------

/**
 * Función principal de actualización de gráficas.
 *
 * Responsabilidades:
 * - Leer filtros activos desde el DOM
 * - Ejecutar consultas en paralelo al backend
 * - Disparar el renderizado de cada componente visual
 *
 * Se utiliza Promise.all para reducir latencia total.
 */
async function cargarGraficasTendencias() {
  console.log('Actualizando gráficas analíticas');

  // Recuperación de filtros desde la interfaz
  const fDesde = document.getElementById('fechaDesde')?.value || '';
  const fHasta = document.getElementById('fechaHasta')?.value || '';
  const btnActivo = document.querySelector('#estatusButtons button.active');

  let estatus = btnActivo ? btnActivo.textContent.trim() : '';
  if (estatus === 'Todos') estatus = '';

  const params = new URLSearchParams({
    fechaDesde: fDesde,
    fechaHasta: fHasta,
    estatus: estatus
  });

  try {
    /**
     * Ejecución concurrente de peticiones:
     * - Evolución mensual
     * - Desempeño por sucursal
     * - ROI por cohorte
     */
    const [resMensual, resSucursal, resRoi] = await Promise.all([
      fetch(`/api/graficas/mensual?${params}`),
      fetch(`/api/graficas/sucursales?${params}`),
      fetch(`/api/graficas/roi?${params}`)
    ]);

    const dataMensual = await resMensual.json();
    const dataSucursal = await resSucursal.json();
    const dataRoi = await resRoi.json();

    /**
     * Renderizado diferido al siguiente frame disponible.
     * Mejora fluidez y evita bloqueos del hilo principal.
     */
    requestAnimationFrame(() => {
      renderEvolucionMensual(dataMensual);
      renderRoiCohorte(dataRoi);
      renderBarrasSucursales(dataSucursal);
      renderPastelSucursales(dataSucursal);
    });

  } catch (error) {
    console.error('Error en el motor de gráficas:', error);
  }
}

// ---------------------------------------------------------
// 4. FUNCIONES DE RENDERIZADO ESPECÍFICO
// ---------------------------------------------------------

/**
 * Gráfica de barras vertical:
 * Comparación mensual entre colocación y cobranza.
 */
function renderEvolucionMensual(datos) {
  const ctx = document.getElementById('chartEvolucion');
  if (!ctx) return;
  if (chartEvolucion) chartEvolucion.destroy();

  chartEvolucion = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: datos.map(d => d.mes),
      datasets: [
        {
          label: 'Colocado',
          data: datos.map(d => Number(d.colocado)),
          backgroundColor: '#3b82f6',
          borderRadius: 3
        },
        {
          label: 'Cobrado',
          data: datos.map(d => Number(d.cobrado)),
          backgroundColor: '#10b981',
          borderRadius: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 30 } },
      plugins: { legend: { position: 'bottom' } },
      scales: { x: { grid: { display: false } } }
    }
  });
}

/**
 * Gráfica de línea:
 * Índice de recuperación (ROI) por mes.
 */
function renderRoiCohorte(datos) {
  const ctx = document.getElementById('chartRoi');
  if (!ctx) return;

  // Limpieza de instancia previa para prevenir fugas de memoria
  if (chartRoi) chartRoi.destroy();

  chartRoi = new Chart(ctx, {
    type: 'line',
    data: {
      labels: datos.map(d => d.mes),
      datasets: [{
        label: 'Porcentaje de recuperación',
        data: datos.map(d => Number(d.roi)),
        borderColor: '#f97316', // Naranja corporativo
        backgroundColor: 'rgba(249, 115, 22, 0.1)',
        fill: true,
        tension: 0.3, // Curvatura suavizada para mejor estética
        pointRadius: 4,
        pointBackgroundColor: '#f97316'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        // Padding superior para dar aire a las etiquetas custom (datalabelsPlugin)
        padding: { top: 30 }
      },
      plugins: {
        /**
         * @property {Object} legend
         * @description Posicionamiento de leyenda en la parte inferior (bottom).
         * Esto evita que se encime en las líneas cuando los valores son altos.
         */
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            boxWidth: 12,
            font: { size: 12, weight: '600' },
            padding: 20
          }
        },
        tooltip: {
          callbacks: {
            label: (c) => `ROI: ${c.parsed.y}%`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            // Formateo de eje Y como porcentaje
            callback: (v) => v + '%'
          },
          grid: {
            color: '#e2e8f0'
          }
        },
        x: {
          grid: {
            display: false // Limpieza visual en el eje horizontal
          }
        }
      }
    }
  });
}

/**
 * Gráfica de barras horizontales:
 * Comparativo de desempeño financiero por sucursal.
 */
function renderBarrasSucursales(datos) {
  const ctx = document.getElementById('chartSucursales');
  if (!ctx) return;

  // Control de instancias para evitar fugas de memoria y superposición de eventos
  if (chartSucursales) chartSucursales.destroy();

  chartSucursales = new Chart(ctx, {
    type: 'bar',
    indexAxis: 'y', // Orientación horizontal
    data: {
      labels: datos.map(d => d.nombre_sucursal),
      datasets: [
        {
          label: 'Colocado',
          data: datos.map(d => Number(d.total_colocado)),
          backgroundColor: 'rgba(59, 130, 246, 0.7)', // Azul traslúcido
          borderColor: '#3b82f6',
          borderWidth: 1
        },
        {
          label: 'Cobrado',
          data: datos.map(d => Number(d.total_cobrado)),
          backgroundColor: 'rgba(16, 185, 129, 0.7)', // Verde traslúcido
          borderColor: '#10b981',
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        // Espacio a la derecha para las etiquetas de datos generadas por el plugin
        padding: { right: 40 }
      },
      plugins: {
        /**
         * @property {Object} legend
         * @description Posicionamiento estratégico en la base del componente.
         */
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            boxWidth: 12,
            font: { size: 12, weight: '700' },
            padding: 20
          }
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      },
      scales: {
        x: {
          // 'grace' añade un margen porcentual al final del eje para evitar que 
          // las etiquetas de texto se corten al borde del canvas.
          grace: '10%',
          beginAtZero: true,
          grid: { color: '#f1f5f9' }
        },
        y: {
          grid: { display: false }
        }
      }
    }
  });
}
/**
 * Gráfica de dona:
 * Distribución del número de préstamos por sucursal.
 */
function renderPastelSucursales(datos) {
  const ctx = document.getElementById('chartPastel');
  if (!ctx) return;
  if (chartPastel) chartPastel.destroy();

  chartPastel = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: datos.map(d => d.nombre_sucursal),
      datasets: [{
        data: datos.map(d => Number(d.cantidad_prestamos)),
        backgroundColor: [
          '#3b82f6',
          '#10b981',
          '#f59e0b',
          '#ef4444',
          '#8b5cf6'
        ]
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        customDataLabels: false,
        tooltip: {
          callbacks: {
            label: function (context) {
              const value = context.parsed;
              const total = context.dataset.data.reduce(
                (a, b) => a + Number(b), 0
              );
              const percentage =
                ((value / total) * 100).toFixed(1) + '%';

              return `${context.label}: ${percentage}`;
            }
          }
        }
      }
    }
  });
}

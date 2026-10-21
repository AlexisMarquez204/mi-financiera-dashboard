/**
 * =========================================================
 * server.js
 * =========================================================
 * Servidor API REST del Dashboard Financiero
 *
 * Este archivo implementa un backend analítico basado en:
 * - Node.js + Express para la exposición de APIs REST
 * - DuckDB como motor analítico embebido (OLAP)
 *
 * El servidor expone endpoints que calculan:
 * - KPIs globales
 * - Indicadores financieros por cohorte
 * - Series temporales y análisis por sucursal
 *
 * El frontend consume estas APIs para construir
 * dashboards visuales (gráficas y tarjetas KPI).
 *
 * =========================================================
 * Autor: MTI JERM
 * Versión: 1.0.0
 * =========================================================
 */

const express = require('express');
const duckdb = require('duckdb');
const app = express();

/**
 * =========================================================
 * 1. CONFIGURACIÓN DE BASE DE DATOS
 * =========================================================
 *
 * DuckDB se utiliza como motor analítico embebido.
 * - No requiere servidor externo
 * - Ideal para consultas agregadas y análisis financiero
 *
 * La base se abre en modo persistente (archivo .duckdb).
 * IMPORTANTE:
 * - La conexión debe mantenerse abierta durante toda
 *   la vida del proceso Node.js.
 */
const db = new duckdb.Database('mi_financiera_demo_duck_lab.duckdb');
const conn = db.connect();

/**
 * =========================================================
 * 2. CONFIGURACIÓN DE MIDDLEWARE
 * =========================================================
 *
 * Se habilita el servicio de archivos estáticos para el
 * frontend del dashboard (HTML, JS, CSS).
 *
 * Carpeta esperada:
 * /public
 */
app.use(express.static('public'));

/**
 * =========================================================
 * 3. UTILIDAD: NORMALIZACIÓN DE BIGINT
 * =========================================================
 *
 * DuckDB retorna columnas agregadas (SUM, COUNT, AVG)
 * como tipo BIGINT.
 *
 * JSON.stringify() no soporta BigInt de forma nativa,
 * por lo que es necesario convertirlos a string antes
 * de enviarlos al cliente.
 *
 * Esta función:
 * - Recorre objetos y arreglos recursivamente
 * - Convierte cualquier BigInt en string
 * - Mantiene intactos los demás tipos
 *
 * @param {*} obj Resultado de una consulta DuckDB
 * @returns {*} Objeto serializable a JSON
 */
function bigIntToString(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();

  /**
   * CORRECCIÓN: DuckDB entrega las columnas DATE como objetos Date.
   * Sin este caso, el recorrido de abajo los convertía en {} y se
   * perdían fecha_emision / fecha_vencimiento de las tarjetas.
   * Se devuelven como texto YYYY-MM-DD.
   */
  if (obj instanceof Date) return obj.toISOString().slice(0, 10);

  if (Array.isArray(obj)) {
    return obj.map(bigIntToString);
  }

  if (typeof obj === 'object') {
    const newObj = {};
    for (const key in obj) {
      newObj[key] = bigIntToString(obj[key]);
    }
    return newObj;
  }

  return obj;
}

/**
 * =========================================================
 * API 1: KPIs GLOBALES (SIDEBAR)
 * =========================================================
 *
 * Endpoint diseñado para cargar indicadores generales
 * del sistema al iniciar el dashboard.
 *
 * Métricas:
 * - Número total de clientes
 * - Número total de empleados
 * - Número total de sucursales
 * - Tasa de interés promedio histórica
 * - Monto promedio de crédito otorgado
 *
 * Estas métricas NO aplican filtros de cohorte,
 * representan el estado global del negocio.
 *
 * @route GET /api/kpis-sidebar
 */
app.get('/api/kpis-sidebar', (req, res) => {
  const sql = `
    SELECT
      (SELECT COUNT(*) FROM cliente) AS clientes,
      (SELECT COUNT(*) FROM empleado) AS empleados,
      (SELECT COUNT(*) FROM sucursal) AS sucursales,
      COALESCE(AVG(interes_anual), 0) AS tasa_promedio,
      COALESCE(AVG(monto_credito), 0) AS credito_promedio
    FROM prestamo
  `;

  conn.all(sql, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    // Se retorna un solo registro con KPIs
    res.json(bigIntToString(rows[0] || {}));
  });
});

/**
 * =========================================================
 * API 2: INDICADORES FINANCIEROS POR COHORTE
 * =========================================================
 *
 * Este endpoint compara:
 * - Capital colocado (créditos otorgados)
 * - Capital recuperado (pagos realizados)
 * - Saldos pendientes
 *
 * El análisis se hace por cohorte:
 * - Préstamos originados dentro de un rango de fechas
 *
 * Parámetros opcionales:
 * - estatus      : estado del crédito
 * - fechaDesde  : inicio del periodo (YYYY-MM-DD)
 * - fechaHasta  : fin del periodo (YYYY-MM-DD)
 *
 * @route GET /api/indicadores-financieros
 */
app.get('/api/indicadores-financieros', (req, res) => {
  const {
    estatus = '',
    fechaDesde = '2000-01-01',
    fechaHasta = '2099-12-31'
  } = req.query;

  /**
   * Construcción dinámica del filtro de cohorte.
   * Se utiliza SQL parametrizado para evitar inyección.
   */
  let wherePrestamo =
    "CAST(fecha_inicio AS DATE) BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)";
  let params = [fechaDesde, fechaHasta];

  if (estatus) {
    wherePrestamo += " AND estatus_credito = ?";
    params.push(estatus);
  }

  /**
   * Flujo lógico del query:
   * 1. Identificar préstamos de la cohorte
   * 2. Calcular montos colocados
   * 3. Calcular montos cobrados
   * 4. Calcular saldos pendientes
   */
  const sql = `
    WITH prestamos_cohorte AS (
      SELECT id_prestamo, monto_credito, monto_intereses, monto_comisiones
      FROM prestamo
      WHERE ${wherePrestamo}
    ),
    colocado AS (
      SELECT
        COALESCE(SUM(monto_credito), 0) AS col_k,
        COALESCE(SUM(monto_intereses), 0) AS col_i,
        COALESCE(SUM(monto_comisiones), 0) AS col_c
      FROM prestamos_cohorte
    ),
    cobrado AS (
      SELECT
        COALESCE(SUM(pc.monto_credito), 0) AS cob_k,
        COALESCE(SUM(pc.monto_intereses), 0) AS cob_i,
        COALESCE(SUM(pc.monto_comisiones), 0) AS cob_c
      FROM pago_credito pc
      WHERE pc.id_prestamo IN (SELECT id_prestamo FROM prestamos_cohorte)
    )
    SELECT
      c.col_k AS colocado_credito,
      c.col_i AS colocado_intereses,
      c.col_c AS colocado_comisiones,
      b.cob_k AS cobrado_credito,
      b.cob_i AS cobrado_intereses,
      b.cob_c AS cobrado_comisiones,
      (c.col_k - b.cob_k) AS saldo_credito,
      (c.col_i - b.cob_i) AS saldo_intereses,
      (c.col_c - b.cob_c) AS saldo_comisiones
    FROM colocado c, cobrado b
  `;

  conn.all(sql, ...params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    res.json(bigIntToString(rows[0] || {}));
  });
});

/**
 * =========================================================
 * API 3: GRÁFICAS ANALÍTICAS
 * =========================================================
 * Estas APIs retornan series listas para ser consumidas
 * directamente por librerías de visualización (Chart.js).
 */

/**
 * ---------------------------------------------------------
 * GRÁFICA MENSUAL: COLOCADO VS COBRADO
 * ---------------------------------------------------------
 *
 * Genera una serie temporal mensual que compara:
 * - Capital colocado
 * - Capital recuperado
 *
 * @route GET /api/graficas/mensual
 */
app.get('/api/graficas/mensual', (req, res) => {
  const { estatus = '', fechaDesde = '2000-01-01', fechaHasta = '2099-12-31' } = req.query;

  let wherePrestamo =
    "CAST(fecha_inicio AS DATE) BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)";
  let params = [fechaDesde, fechaHasta];

  if (estatus) {
    wherePrestamo += " AND estatus_credito = ?";
    params.push(estatus);
  }

  const sql = `
    WITH prestamos_cohorte AS (
      SELECT id_prestamo, fecha_inicio, monto_credito
      FROM prestamo
      WHERE ${wherePrestamo}
    ),
    cobrado_por_prestamo AS (
      SELECT id_prestamo, SUM(monto_credito + monto_intereses) AS total_cobrado
      FROM pago_credito
      WHERE id_prestamo IN (SELECT id_prestamo FROM prestamos_cohorte)
      GROUP BY 1
    )
    SELECT 
      strftime(p.fecha_inicio, '%Y-%m') AS mes,
      SUM(p.monto_credito) AS colocado,
      COALESCE(SUM(cp.total_cobrado), 0) AS cobrado
    FROM prestamos_cohorte p
    LEFT JOIN cobrado_por_prestamo cp
      ON p.id_prestamo = cp.id_prestamo
    GROUP BY 1
    ORDER BY 1;
  `;

  conn.all(sql, ...params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(bigIntToString(rows));
  });
});

/**
 * ---------------------------------------------------------
 * GRÁFICA POR SUCURSAL
 * ---------------------------------------------------------
 *
 * Analiza el desempeño operativo de cada sucursal:
 * - Número de préstamos
 * - Monto colocado
 * - Monto recuperado
 *
 * @route GET /api/graficas/sucursales
 */
app.get('/api/graficas/sucursales', (req, res) => {
  const { estatus = '', fechaDesde = '2000-01-01', fechaHasta = '2099-12-31' } = req.query;

  let wherePrestamo =
    "CAST(p.fecha_inicio AS DATE) BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)";
  let params = [fechaDesde, fechaHasta];

  if (estatus) {
    wherePrestamo += " AND p.estatus_credito = ?";
    params.push(estatus);
  }

  const sql = `
    WITH prestamos_cohorte AS (
      SELECT p.id_prestamo, p.monto_credito, s.nombre_sucursal
      FROM prestamo p
      JOIN empleado e ON p.id_empleado = e.id_empleado
      JOIN sucursal s ON e.id_sucursal = s.id_sucursal
      WHERE ${wherePrestamo}
    ),
    cobrado_por_prestamo AS (
      SELECT id_prestamo, SUM(monto_credito + monto_intereses) AS total_cobrado
      FROM pago_credito
      WHERE id_prestamo IN (SELECT id_prestamo FROM prestamos_cohorte)
      GROUP BY 1
    )
    SELECT 
      pc.nombre_sucursal,
      COUNT(pc.id_prestamo) AS cantidad_prestamos,
      SUM(pc.monto_credito) AS total_colocado,
      COALESCE(SUM(cp.total_cobrado), 0) AS total_cobrado
    FROM prestamos_cohorte pc
    LEFT JOIN cobrado_por_prestamo cp
      ON pc.id_prestamo = cp.id_prestamo
    GROUP BY 1
    ORDER BY total_colocado DESC;
  `;

  conn.all(sql, ...params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(bigIntToString(rows));
  });
});

/**
 * ---------------------------------------------------------
 * GRÁFICA ROI (ÍNDICE DE RECUPERACIÓN)
 * ---------------------------------------------------------
 *
 * ROI mensual:
 * ROI = (Total Cobrado / Total Colocado) * 100
 *
 * @route GET /api/graficas/roi
 */
app.get('/api/graficas/roi', (req, res) => {
  const { estatus = '', fechaDesde = '2000-01-01', fechaHasta = '2099-12-31' } = req.query;

  let wherePrestamo =
    "CAST(fecha_inicio AS DATE) BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)";
  let params = [fechaDesde, fechaHasta];

  if (estatus) {
    wherePrestamo += " AND estatus_credito = ?";
    params.push(estatus);
  }

  const sql = `
    WITH prestamos_cohorte AS (
      SELECT id_prestamo, fecha_inicio, monto_credito
      FROM prestamo
      WHERE ${wherePrestamo}
    ),
    cobrado_por_prestamo AS (
      SELECT id_prestamo, SUM(monto_credito + monto_intereses) AS total_cobrado
      FROM pago_credito
      WHERE id_prestamo IN (SELECT id_prestamo FROM prestamos_cohorte)
      GROUP BY 1
    )
    SELECT 
      strftime(p.fecha_inicio, '%Y-%m') AS mes,
      CASE
        WHEN SUM(p.monto_credito) = 0 THEN 0
        ELSE ROUND(
          (SUM(COALESCE(cp.total_cobrado, 0)) / SUM(p.monto_credito)) * 100,
          2
        )
      END AS roi
    FROM prestamos_cohorte p
    LEFT JOIN cobrado_por_prestamo cp
      ON p.id_prestamo = cp.id_prestamo
    GROUP BY 1
    ORDER BY 1;
  `;

  conn.all(sql, ...params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    // CORRECCIÓN: se normalizan los BigInt también en este endpoint
    // (antes enviaba rows directo y JSON.stringify podía fallar).
    res.json(bigIntToString(rows));
  });
});


/**
 * =========================================================
 * API : INFORMACIÓN DE TARJETAS DE CRÉDITO
 * =========================================================
 */
app.get('/api/limites-creditos', (req, res) => {

const sql = `select sum(limite_credito) as "Suma Limite Credito"
FROM tarjeta_credito`;
 conn.all(sql, (err, rows) => {
    if (err) {
      console.error('Error al consultar tarjetas:', err.message);
      return res.status(500).json({ error: err.message });
    }

    res.json(bigIntToString(rows));
  });
});


/**
 * =========================================================
 * API : INFORMACIÓN DE TARJETAS DE CRÉDITO
 * =========================================================
 */
app.get('/api/saldos-utilizados', (req, res) => {

const sql = `select sum(saldo_actual) as "Saldo Utilizado" 
FROM tarjeta_credito;`;
 conn.all(sql, (err, rows) => {
    if (err) {
      console.error('Error al consultar tarjetas:', err.message);
      return res.status(500).json({ error: err.message });
    }

    res.json(bigIntToString(rows));
  });
});

/**
 * =========================================================
 * API : INFORMACIÓN DE TARJETAS DE CRÉDITO
 * =========================================================
 */
app.get('/api/saldos-actuales', (req, res) => {

const sql = `select sum(limite_credito) -sum( saldo_actual) as "Credito Disponible" 
FROM tarjeta_credito;`;	
 conn.all(sql, (err, rows) => {
    if (err) {
      console.error('Error al consultar tarjetas:', err.message);
      return res.status(500).json({ error: err.message });
    }

    res.json(bigIntToString(rows));
  });
});






/**
 * =========================================================
 * API 4: INFORMACIÓN DE TARJETAS DE CRÉDITO
 * =========================================================
 */
app.get('/api/tarjetas-creditos', (req, res) => {
  
  const porPagina = Math.min(Math.max(parseInt(req.query.porPagina, 10) || 100, 1), 1000);
  const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1);
  const offset = (pagina - 1) * porPagina;

  /**
   * CORRECCIÓN: los montos DECIMAL se convierten a DOUBLE para que
   * lleguen al navegador siempre como número (no como objeto/BigInt).
   */
  const sql = `
    SELECT
      id_tarjeta,
      id_cliente,
      num_tarjeta,
      CAST(limite_credito AS DOUBLE) AS limite_credito,
      CAST(saldo_actual AS DOUBLE) AS saldo_actual,
      CAST(limite_credito - saldo_actual AS DOUBLE) AS credito_disponible,
      fecha_emision,
      fecha_vencimiento,
      estatus,
      comentario
    FROM tarjeta_credito
    ORDER BY id_tarjeta DESC
    LIMIT ${porPagina} OFFSET ${offset}
  `;

  conn.all(sql, (err, rows) => {
    if (err) {
      console.error('Error al consultar tarjetas:', err.message);
      return res.status(500).json({ error: err.message });
    }

    res.json(bigIntToString(rows));
  });
});


/**
 * =========================================================
 * API 5: INDICADORES AGREGADOS DE TARJETAS DE CRÉDITO
 * =========================================================
 */
app.get('/api/graficas/tarjetas-creditos', (req, res) => {
	
	 const {
    estatus = '',
    fechaDesde = '2000-01-01',
    fechaHasta = '2099-12-31'
  } = req.query;
  
  const whereTarjeta = "CAST(fecha_emision AS DATE) BETWEEN CAST(? AS DATE) AND CAST(? AS DATE)";
  const params = [fechaDesde, fechaHasta];

  const sqlResumen = `
    SELECT
      COUNT(*) AS total_tarjetas,
      CAST(COALESCE(SUM(limite_credito), 0) AS DOUBLE) AS limite_total,
      CAST(COALESCE(SUM(saldo_actual), 0) AS DOUBLE) AS saldo_total,
      CAST(COALESCE(
        SUM(limite_credito - saldo_actual), 0
      ) AS DOUBLE) AS disponible_total
    FROM tarjeta_credito
    WHERE ${whereTarjeta}
  `;

  /**
   * CORRECCIÓN: GROUP BY 1 agrupa por la expresión COALESCE,
   * así los estatus NULL salen como 'Sin estatus' en una sola fila.
   */
  const sqlEstatus = `
    SELECT
      COALESCE(estatus, 'Sin estatus') AS estatus,
      COUNT(*) AS cantidad_tarjetas,
      CAST(COALESCE(SUM(limite_credito), 0) AS DOUBLE) AS limite_total,
      CAST(COALESCE(SUM(saldo_actual), 0) AS DOUBLE) AS saldo_total
    FROM tarjeta_credito
    WHERE ${whereTarjeta}
    GROUP BY 1
    ORDER BY cantidad_tarjetas DESC
  `;

   conn.all(sqlResumen, ...params, (err, resumen) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    conn.all(sqlEstatus, ...params, (err, estatus) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      res.json({
        resumen: bigIntToString(resumen[0] || {}),
        estatus: bigIntToString(estatus || [])
      });
    });
  });
});







/**
 * =========================================================
 * INICIALIZACIÓN DEL SERVIDOR
 * =========================================================
 */
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`* Servidor analítico activo en http://localhost:${PORT}`);
  console.log(`* Motor DuckDB conectado exitosamente.`);
});

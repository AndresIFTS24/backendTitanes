const express = require('express');
const cors = require('cors');
const sql = require('msnodesqlv8');
const { rows } = require('mssql');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Cadena de conexión
const connectionString = 'Driver={ODBC Driver 17 for SQL Server};Server=localhost\\SQLEXPRESS;Database=ClubTitanes;Trusted_Connection=Yes;';



app.post('/api/socios', (req, res) => {
    const {
    nombreSocio,
    apellidoSocio,
    dniSocio,
    fecha_nacimientoSocio,
    direccionSocio,
    telefonoSocio,
    categoriaSocio,
    actividadesSocio,
    emailSocio,
    contrasenaSocio
    } = req.body;

  // Validación de campos
    if (
    !nombreSocio ||
    !apellidoSocio ||
    !dniSocio ||
    !fecha_nacimientoSocio ||
    !direccionSocio ||
    !telefonoSocio ||
    !categoriaSocio ||
    !Array.isArray(actividadesSocio) ||
    actividadesSocio.length === 0 ||
    !emailSocio ||
    !contrasenaSocio
    ) {
    return res.status(400).json({ mensaje: 'Faltan datos obligatorios' });
    }

    sql.open(connectionString, async (err, conn) => {
    if (err) {
        return res.status(500).json({
        mensaje: 'Error al conectar con la base de datos',
        error: err
        });
    }

    try {
      // Verificar si el DNI ya está registrado
        const checkDniSocio = await ejecutarQuery(conn, 'SELECT id_persona FROM Persona WHERE dni = ?', [dniSocio]);
        if (checkDniSocio.length > 0) return res.status(409).json({ mensaje: 'El DNI ya está registrado' });

      // Verificar si el email ya está registrado
        const checkEmailSocio = await ejecutarQuery(conn, 'SELECT id_usuario FROM Usuario WHERE email = ?', [emailSocio]);
        if (checkEmailSocio.length > 0) return res.status(409).json({ mensaje: 'El email ya está registrado' });

      // Insertar en Persona
        const personaResSocio = await ejecutarQuery(conn, `
    INSERT INTO Persona (nombre, apellido, dni, fecha_nacimiento, direccion, telefono)
    OUTPUT INSERTED.id_persona
    VALUES (?, ?, ?, ?, ?, ?)`,[nombreSocio, apellidoSocio, dniSocio, fecha_nacimientoSocio, direccionSocio, telefonoSocio]);
console.log(personaResSocio.recordset);
const id_persona = personaResSocio.recordset[0].id_persona;
      // Obtener id_categoria desde su nombre
        const espResSocio = await ejecutarQuery(conn, 'SELECT id_categoria FROM Categoria WHERE nombre = ?', [categoriaSocio]);
        if (espResSocio.length === 0) throw new Error('Categoría no encontrada');
        const id_categoria = espResSocio.recordset[0].id_categoria;

      // Insertar en Socio
        const socioRes = await ejecutarQuery(conn, `
        INSERT INTO Socio (id_persona, estado_socio ,id_categoria)
        OUTPUT INSERTED.id_socio
        VALUES (?, 1, ?)`, [id_persona, id_categoria]);

        const id_socio = socioRes.recordset[0].id_socio;

      // Insertar en Usuario
        await ejecutarQuery(conn, `
        INSERT INTO Usuario (id_persona, email, contraseña, id_rol, habilitado, fecha_de_registro, ultimo_inicio_sesion)
        VALUES (?, ?, ?, 1, 1, GETDATE(), GETDATE())`,
        [id_persona, emailSocio, contrasenaSocio]);

      // Insertar inscripciones
        for (const nombreActividadSocio of actividadesSocio) {
        const actResSocio = await ejecutarQuery(conn, 'SELECT id_actividad FROM Actividad WHERE nombre = ?', [nombreActividadSocio]);
        if (actResSocio.length === 0) throw new Error(`Actividad no encontrada: ${nombreActividadSocio}`);

        const id_actividad = actResSocio.recordset[0].id_actividad;
        await ejecutarQuery(conn, `INSERT INTO Inscripcion (id_socio, id_actividad, fecha_inscripcion, estado)VALUES (?, ?, GETDATE(), 1)`,[id_socio, id_actividad]);}
res.status(200).json({ mensaje: 'Socio registrado exitosamente' });
    } catch (error) {
  console.error("Error completo:", error); // Esto te muestra más detalles por consola
    res.status(500).json({
    mensaje: 'Error al registrar socio',
    error: error.message || error
    });
}
    });
});
// app.get('/api/socios/nombre/:nombre', (req, res) => {
// const nombre = `%${req.params.nombre.trim().toLowerCase()}%`;

//   sql.open(connectionString, async (err, conn) => {
//     if (err) return res.status(500).json({ mensaje: 'Error de conexión', error: err });

//     try {
//       const query = `
//         SELECT 
//           P.nombre AS nombre_socio,
//           P.apellido AS apellido_socio,
//           P.dni,
//           S.estado_socio,
//           C.nombre AS categoria
//         FROM Persona P
//         INNER JOIN Socio S ON P.id_persona = S.id_persona
//         INNER JOIN Categoria C ON S.id_categoria = C.id_categoria
// WHERE LOWER(P.nombre) LIKE @nombre
//       `;

//       const result = await conn.request()
// .input('nombre', sql.VarChar, nombre)
//         .query(query);

//       res.json(result.recordset);
//     } catch (error) {
//       console.error("Error al obtener socios:", error);
//       res.status(500).json({ mensaje: 'Error al obtener socios', error: error.message || error });
//     }
//   });
// });

app.put('/api/socios/:id', (req, res) => {
  console.log('📥 req.body:', req.body);
  const idSocio = req.params.id;
  const {
    nombreSocio,
    apellidoSocio,
    dniSocio,
    fecha_nacimientoSocio,
    direccionSocio,
    telefonoSocio,
    categoriaSocio,
    actividadesSocio
  } = req.body;

  if (
    !nombreSocio || !apellidoSocio || !dniSocio ||
    !fecha_nacimientoSocio || !direccionSocio || !telefonoSocio ||
    !categoriaSocio || !Array.isArray(actividadesSocio)
  ) {
    return res.status(400).json({ mensaje: 'Faltan datos obligatorios' });
  }

  sql.open(connectionString, async (err, conn) => {
    if (err) {
      return res.status(500).json({ mensaje: 'Error al conectar con la base de datos', error: err });
    }

    try {
      // Obtener id_persona desde id_socio
      const socioRes = await ejecutarQuery(conn, 'SELECT id_persona FROM Socio WHERE id_socio = ?', [idSocio]);
      if (socioRes.recordset.length === 0) {
        return res.status(404).json({ mensaje: 'Socio no encontrado' });
      }

      const id_persona = socioRes.recordset[0].id_persona;

      // Actualizar Persona
      await ejecutarQuery(conn, `
        UPDATE Persona
        SET nombre = ?, apellido = ?, dni = ?, fecha_nacimiento = ?, direccion = ?, telefono = ?
        WHERE id_persona = ?
      `, [nombreSocio, apellidoSocio, dniSocio, fecha_nacimientoSocio, direccionSocio, telefonoSocio, id_persona]);

      // Obtener id_categoria
      const catRes = await ejecutarQuery(conn, 'SELECT id_categoria FROM Categoria WHERE nombre = ?', [categoriaSocio]);
      if (catRes.recordset.length === 0) {
        return res.status(404).json({ mensaje: 'Categoría no encontrada' });
      }
      const id_categoria = catRes.recordset[0].id_categoria;

      // Actualizar Socio
      await ejecutarQuery(conn, `UPDATE Socio SET id_categoria = ? WHERE id_socio = ?`, [id_categoria, idSocio]);

      // Borrar inscripciones anteriores
      await ejecutarQuery(conn, `DELETE FROM Inscripcion WHERE id_socio = ?`, [idSocio]);

      // Traer todos los ID de las actividades en una sola consulta
      if (actividadesSocio.length > 0) {
        const placeholders = actividadesSocio.map(() => '?').join(', ');
        const queryActividades = `SELECT id_actividad, nombre FROM Actividad WHERE nombre IN (${placeholders})`;
        const actRes = await ejecutarQuery(conn, queryActividades, actividadesSocio);

        // Verificamos si todas las actividades existen
        if (actRes.recordset.length !== actividadesSocio.length) {
          return res.status(400).json({ mensaje: 'Una o más actividades no fueron encontradas' });
        }

        // Insertar todas las inscripciones nuevas
        for (const act of actRes.recordset) {
          await ejecutarQuery(conn, `
            INSERT INTO Inscripcion (id_socio, id_actividad, fecha_inscripcion, estado)
            VALUES (?, ?, GETDATE(), 1)
          `, [idSocio, act.id_actividad]);
        }
      }

      res.status(200).json({ mensaje: 'Socio actualizado exitosamente' });

    } catch (error) {
      console.error("Error al actualizar socio:", error);
      res.status(500).json({ mensaje: 'Error al actualizar socio', error: error.message || error });
    }
  });
});
app.get('/api/socios', (req, res) => {
  sql.open(connectionString, async (err, conn) => {
    if (err) return res.status(500).json({ mensaje: 'Error de conexión', error: err });

    try {
      // Obtener todos los socios con sus datos personales, categoría y estado
      const sociosQuery = `
        SELECT 
          S.id_socio,
          S.id_categoria,
          S.id_persona,
          S.estado_socio,
          P.nombre,
          P.apellido,
          P.dni,
          P.fecha_nacimiento,
          P.direccion,
          P.telefono,
          U.email,
          C.nombre AS categoria,
          C.cuota AS cuota_categoria
        FROM Socio S
        INNER JOIN Persona P ON S.id_persona = P.id_persona
        INNER JOIN Usuario U ON U.id_persona = P.id_persona
        INNER JOIN Categoria C ON S.id_categoria = C.id_categoria;
      `;

      const sociosRes = await ejecutarQuery(conn, sociosQuery);
      const socios = sociosRes.recordset;

      // Obtener todas las actividades con id_socio
      const actividadesQuery = `
        SELECT I.id_socio, A.nombre, A.precio
        FROM Inscripcion I
        INNER JOIN Actividad A ON I.id_actividad = A.id_actividad
      `;
      const actividadesRes = await ejecutarQuery(conn, actividadesQuery);

      // Agrupar actividades por socio
      const actividadesPorSocio = {};
      actividadesRes.recordset.forEach(({ id_socio, nombre, precio }) => {
        if (!actividadesPorSocio[id_socio]) {
          actividadesPorSocio[id_socio] = [];
        }
        actividadesPorSocio[id_socio].push({ nombre, precio });
      });

      // Agregar actividades a cada socio
      const sociosCompletos = socios.map(s => ({
        ...s,
        actividadesSocio: actividadesPorSocio[s.id_socio] || []
      }));

      res.json(sociosCompletos);
    } catch (error) {
      console.error("Error al listar socios:", error);
      res.status(500).json({ mensaje: 'Error al listar socios', error: error.message || error });
    }
  });
});
app.get('/api/socio/dni/:dni', (req, res) => {
  const dni = req.params.dni;

  sql.open(connectionString, async (err, conn) => {
    if (err) {
      return res.status(500).json({ mensaje: 'Error de conexión', error: err });
    }

    try {
      const query = `
SELECT 
  P.nombre AS nombre_socio,
  P.apellido AS apellido_socio,
  P.dni,
  A.nombre AS nombre_actividad,
  A.dia,
  A.horario,
  PP.nombre AS nombre_profesor,
  PP.apellido AS apellido_profesor
FROM Persona P
INNER JOIN Socio S ON P.id_persona = S.id_persona
INNER JOIN Inscripcion I ON S.id_socio = I.id_socio
INNER JOIN Actividad A ON I.id_actividad = A.id_actividad
INNER JOIN ProfesorActividad PA ON A.id_actividad = PA.id_actividad
INNER JOIN Profesor PR ON PA.id_profesor = PR.id_profesor
INNER JOIN Persona PP ON PR.id_persona = PP.id_persona
WHERE P.dni = ?;
      `;

      const result = await ejecutarQuery(conn, query, [dni]);

      if (result.recordset.length === 0) {
        return res.status(404).json({ mensaje: 'Socio no encontrado o sin inscripciones' });
      }

      res.json(result.recordset); // puede devolver varias actividades
    } catch (error) {
      console.error("Error al buscar socio por DNI:", error);
      res.status(500).json({ mensaje: 'Error al buscar socio', error: error.message || error });
    }
  });
});
app.get('/api/actividades/:dia', (req, res) => {
  const dia = req.params.dia.toLowerCase();

  sql.open(connectionString, async (err, conn) => {
    if (err) return res.status(500).json({ mensaje: 'Error de conexión', error: err });

    try {
      const query = `
        SELECT nombre, dia, horario, lugar, precio, 
               (SELECT COUNT(*) FROM Inscripcion I WHERE I.id_actividad = A.id_actividad) AS cantidad_anotados,
               cupo_maximo
        FROM Actividad A
        WHERE LOWER(dia) = @dia
      `;

      const result = await conn.request()
        .input('dia', sql.VarChar, dia)
        .query(query);

      res.json(result.recordset);

    } catch (error) {
      console.error("Error al obtener actividades:", error);
      res.status(500).json({ mensaje: 'Error al obtener actividades', error: error.message || error });
    }
  });
});




app.delete('/api/socios/:id', (req, res) => {
  const idSocio = req.params.id;

  sql.open(connectionString, async (err, conn) => {
    if (err) return res.status(500).json({ mensaje: 'Error de conexión', error: err });

    try {
      // Obtener id_persona
      const socioRes = await ejecutarQuery(conn, 'SELECT id_persona FROM Socio WHERE id_socio = ?', [idSocio]);
      if (socioRes.recordset.length === 0) return res.status(404).json({ mensaje: 'Socio no encontrado' });

      const id_persona = socioRes.recordset[0].id_persona;

      // Borrar inscripciones
      await ejecutarQuery(conn, 'DELETE FROM Inscripcion WHERE id_socio = ?', [idSocio]);

      // Borrar usuario
      await ejecutarQuery(conn, 'DELETE FROM Usuario WHERE id_persona = ?', [id_persona]);

      // Borrar socio
      await ejecutarQuery(conn, 'DELETE FROM Socio WHERE id_socio = ?', [idSocio]);

      // Borrar persona
      await ejecutarQuery(conn, 'DELETE FROM Persona WHERE id_persona = ?', [id_persona]);

      res.json({ mensaje: 'Socio eliminado exitosamente' });
    } catch (error) {
      console.error("Error al eliminar socio:", error);
      res.status(500).json({ mensaje: 'Error al eliminar socio', error: error.message || error });
    }
  });
});

function ejecutarQuery(conn, query, params) {
    return new Promise((resolve, reject) => {
    conn.query(query, params, (err, rows) => {
        if (err) return reject(err);
        resolve({ recordset: rows });
    });
  });
}
app.get('/api/actividades', (req, res) => {
  const query = `
    SELECT 
      id_actividad,
      nombre,
      categoria,
      dia,
      horario,
      lugar,
      precio,
      cupo_maximo,
      cantidad_anotados
    FROM Actividad
  `;
  sql.query(connectionString, query, (err, rows) => {
    if (err) {
      console.error('Error en la consulta:', err);
      res.status(500).send('Error en la consulta');
    } else {
      res.json(rows);
    }
  });
});
app.get('/api/categoriaSocio', (req, res)=>{
  const query = `SELECT id_categoria, nombre, descripcion, cuota
  FROM Categoria;`;
  sql.query(connectionString, query, (err, rows)=>{
    if (err) {
      console.log('Error en la consulta: ', err);
      res.status(500).send('Error en la consulta');
    }else{
      res.json(rows);
    }
  });
})
app.listen(PORT, () => {
    console.log(`✅ Servidor backend escuchando en http://localhost:${PORT}`);
});
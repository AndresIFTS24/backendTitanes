const express = require('express');
const cors = require('cors');
const sql = require('msnodesqlv8');

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
      const checkDniSocio = await ejecutarQuery(conn, 'SELECT id_persona FROM Persona WHERE dni = ?', [dniSocio]);
      if (checkDniSocio.recordset.length > 0) return res.status(409).json({ mensaje: 'El DNI ya está registrado' });

      const checkEmailSocio = await ejecutarQuery(conn, 'SELECT id_usuario FROM Usuario WHERE email = ?', [emailSocio]);
      if (checkEmailSocio.recordset.length > 0) return res.status(409).json({ mensaje: 'El email ya está registrado' });

      const personaResSocio = await ejecutarQuery(conn, `
        INSERT INTO Persona (nombre, apellido, dni, fecha_nacimiento, direccion, telefono)
        OUTPUT INSERTED.id_persona
        VALUES (?, ?, ?, ?, ?, ?)`,
        [nombreSocio, apellidoSocio, dniSocio, fecha_nacimientoSocio, direccionSocio, telefonoSocio]);

      const id_persona = personaResSocio.recordset[0].id_persona;

      const espResSocio = await ejecutarQuery(conn, 'SELECT id_categoria FROM Categoria WHERE nombre = ?', [categoriaSocio]);
      if (espResSocio.recordset.length === 0) throw new Error('Categoría no encontrada');
      const id_categoria = espResSocio.recordset[0].id_categoria;

      const socioRes = await ejecutarQuery(conn, `
        INSERT INTO Socio (id_persona, estado_socio ,id_categoria)
        OUTPUT INSERTED.id_socio
        VALUES (?, 1, ?)`, [id_persona, id_categoria]);

      const id_socio = socioRes.recordset[0].id_socio;

      await ejecutarQuery(conn, `
        INSERT INTO Usuario (id_persona, email, contraseña, id_rol, habilitado, fecha_de_registro, ultimo_inicio_sesion)
        VALUES (?, ?, ?, 1, 1, GETDATE(), GETDATE())`,
        [id_persona, emailSocio, contrasenaSocio]);

      for (const nombreActividadSocio of actividadesSocio) {
        const actResSocio = await ejecutarQuery(conn, 'SELECT id_actividad FROM Actividad WHERE nombre = ?', [nombreActividadSocio]);
        if (actResSocio.recordset.length === 0) throw new Error(`Actividad no encontrada: ${nombreActividadSocio}`);

        const id_actividad = actResSocio.recordset[0].id_actividad;
        await ejecutarQuery(conn, `INSERT INTO Inscripcion (id_socio, id_actividad, fecha_inscripcion, estado) VALUES (?, ?, GETDATE(), 1)`, [id_socio, id_actividad]);
      }

      res.status(200).json({ mensaje: 'Socio registrado exitosamente' });
    } catch (error) {
      console.error("Error completo:", error);
      res.status(500).json({
        mensaje: 'Error al registrar socio',
        error: error.message || error
      });
    }
  });
});

app.put('/api/socios/:id', (req, res) => {
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
      const socioRes = await ejecutarQuery(conn, 'SELECT id_persona FROM Socio WHERE id_socio = ?', [idSocio]);
      if (socioRes.recordset.length === 0) {
        return res.status(404).json({ mensaje: 'Socio no encontrado' });
      }

      const id_persona = socioRes.recordset[0].id_persona;

      await ejecutarQuery(conn, `
        UPDATE Persona
        SET nombre = ?, apellido = ?, dni = ?, fecha_nacimiento = ?, direccion = ?, telefono = ?
        WHERE id_persona = ?
      `, [nombreSocio, apellidoSocio, dniSocio, fecha_nacimientoSocio, direccionSocio, telefonoSocio, id_persona]);

      const catRes = await ejecutarQuery(conn, 'SELECT id_categoria FROM Categoria WHERE nombre = ?', [categoriaSocio]);
      if (catRes.recordset.length === 0) {
        return res.status(404).json({ mensaje: 'Categoría no encontrada' });
      }
      const id_categoria = catRes.recordset[0].id_categoria;

      await ejecutarQuery(conn, `UPDATE Socio SET id_categoria = ? WHERE id_socio = ?`, [id_categoria, idSocio]);

      await ejecutarQuery(conn, `DELETE FROM Inscripcion WHERE id_socio = ?`, [idSocio]);

      if (actividadesSocio.length > 0) {
        const placeholders = actividadesSocio.map(() => '?').join(', ');
        const queryActividades = `SELECT id_actividad, nombre FROM Actividad WHERE nombre IN (${placeholders})`;
        const actRes = await ejecutarQuery(conn, queryActividades, actividadesSocio);

        if (actRes.recordset.length !== actividadesSocio.length) {
          return res.status(400).json({ mensaje: 'Una o más actividades no fueron encontradas' });
        }

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
    if (err) {
      console.error('❌ Error al abrir conexión:', err);
      return res.status(500).json({ mensaje: 'Error al abrir la conexión', error: err });
    }

    try {
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

      if (!socios || socios.length === 0) {
        return res.status(200).json([]);
      }

      const actividadesQuery = `
        SELECT I.id_socio, A.nombre, A.precio
        FROM Inscripcion I
        INNER JOIN Actividad A ON I.id_actividad = A.id_actividad
      `;

      const actividadesRes = await ejecutarQuery(conn, actividadesQuery);
      const actividades = actividadesRes.recordset || [];

      const actividadesPorSocio = {};
      actividades.forEach(({ id_socio, nombre, precio }) => {
        if (!actividadesPorSocio[id_socio]) {
          actividadesPorSocio[id_socio] = [];
        }
        actividadesPorSocio[id_socio].push({ nombre, precio });
      });

      const sociosCompletos = socios.map(socio => ({
        ...socio,
        actividadesSocio: actividadesPorSocio[socio.id_socio] || []
      }));

      res.json(sociosCompletos);

    } catch (error) {
      console.error("❌ Error al listar socios:", error);
      res.status(500).json({ mensaje: 'Error al listar socios', error: error.message });
    }
  });
});

app.delete('/api/socios/:id', (req, res) => {
  const idSocio = req.params.id;

  sql.open(connectionString, async (err, conn) => {
    if (err) return res.status(500).json({ mensaje: 'Error de conexión', error: err });

    try {
      const socioRes = await ejecutarQuery(conn, 'SELECT id_persona FROM Socio WHERE id_socio = ?', [idSocio]);
      if (socioRes.recordset.length === 0) return res.status(404).json({ mensaje: 'Socio no encontrado' });

      const id_persona = socioRes.recordset[0].id_persona;

      await ejecutarQuery(conn, 'DELETE FROM Inscripcion WHERE id_socio = ?', [idSocio]);
      await ejecutarQuery(conn, 'DELETE FROM Usuario WHERE id_persona = ?', [id_persona]);
      await ejecutarQuery(conn, 'DELETE FROM Socio WHERE id_socio = ?', [idSocio]);
      await ejecutarQuery(conn, 'DELETE FROM Persona WHERE id_persona = ?', [id_persona]);

      res.json({ mensaje: 'Socio eliminado exitosamente' });
    } catch (error) {
      console.error("Error al eliminar socio:", error);
      res.status(500).json({ mensaje: 'Error al eliminar socio', error: error.message || error });
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
app.get('/api/categoriaSocio', (req, res) => {
  // Abrir conexión a BD y hacer consulta
  sql.open(connectionString, async (err, conn) => {
    if (err) return res.status(500).json({ mensaje: 'Error de conexión', error: err });

    try {
      const result = await ejecutarQuery(conn, 'SELECT * FROM Categoria');
      res.json(result.recordset);
    } catch (error) {
      res.status(500).json({ mensaje: 'Error al obtener categorías', error: error.message });
    }
  });
});
// -------------------------------------
// OBTENER ACTIVIDADES
// -------------------------------------


// -------------------------------------
// REGISTRAR PROFESOR
// -------------------------------------
app.post('/api/profesores', async (req, res) => {
  console.log('📥 req.body:', req.body); // DEBUG

  const { nombre, apellido, dni, fecha_nacimiento, direccion, telefono, email, contrasena, especialidad, actividades } = req.body;
  if (!nombre || !apellido || !dni || !fecha_nacimiento || !direccion || !telefono || !email || !contrasena || !especialidad || !Array.isArray(actividades) || actividades.length === 0) {
    return res.status(400).json({ mensaje: 'Faltan datos obligatorios' });
  }

  sql.open(connectionString, async (err, conn) => {
    if (err) return res.status(500).json({ 
      mensaje: 'Error al conectar con la base de datos', error: err 
    });

    try {
      // Verificar DNI
      const checkDni = await ejecutarQuery(conn, "SELECT id_persona FROM Persona WHERE dni = ?", [dni]);
      if (checkDni.length > 0) return res.status(409).json({ mensaje: 'El DNI ya está registrado' });

      // Verificar Email
      const checkEmailQuery = await ejecutarQuery(conn, "SELECT id_usuario FROM Usuario WHERE email = ?", [email]);
      if (checkEmailQuery.length > 0) return res.status(409).json({ mensaje: 'El email ya está registrado' });

      // Insertar persona
      const insertPersona = await ejecutarQuery(conn, `
        INSERT INTO Persona (nombre, apellido, dni, fecha_nacimiento, direccion, telefono)
        OUTPUT INSERTED.id_persona
        VALUES (?, ?, ?, ?, ?, ?)`, [nombre, apellido, dni, fecha_nacimiento, direccion, telefono]);
console.log("🧪 Resultado insertPersona:", insertPersona); // 👈 agregá esto

const id_persona = insertPersona.recordset[0].id_persona; // ✅ Correcta

      // Obtener id_especialidad desde su nombre
      const espRes = await ejecutarQuery(conn, `SELECT id_especialidad FROM Especialidad WHERE nombre = ?`, [especialidad]);
      if (espRes.length === 0) throw new Error("Especialidad no encontrada");
const id_especialidad = espRes.recordset[0].id_especialidad;

      // Insertar profesor
      const insertProfesor = await ejecutarQuery(conn, `
        INSERT INTO Profesor (id_persona, id_especialidad)
        OUTPUT INSERTED.id_profesor
        VALUES (?, ?)`, [id_persona, id_especialidad]);  

      const id_profesor = insertProfesor.recordset[0].id_profesor;

      // Insertar usuario
      await ejecutarQuery(conn, `
        INSERT INTO Usuario (id_persona, email, contraseña, id_rol, habilitado, fecha_de_registro, ultimo_inicio_sesion)
        VALUES (?, ?, ?, 2, 1, GETDATE(), GETDATE())`, [id_persona, email, contrasena]);

      // Obtener ids de las actividades por su nombre
      for (const nombreActividad of actividades) {
        const actRes = await ejecutarQuery(conn, `SELECT id_actividad FROM Actividad WHERE nombre = ?`, [nombreActividad]);
        if (actRes.length === 0) throw new Error(`Actividad no encontrada: ${nombreActividad}`);

        const id_actividad = actRes.recordset[0].id_actividad;
        await ejecutarQuery(conn, `INSERT INTO ProfesorActividad (id_profesor, id_actividad) VALUES (?, ?)`, [id_profesor, id_actividad]);
      }

      res.status(200).json({ mensaje: 'Profesor registrado exitosamente' });
    } catch (error) {
  console.error("❌ Error al registrar profesor:", error); // 👈 MOSTRÁ EL ERROR EN CONSOLA
  res.status(500).json({ 
    mensaje: 'Error al registrar profesor', 
    error: error.message || error // 👈 MOSTRÁ SOLO EL MENSAJE CLARO EN LA RESPUESTA
  });
    }
  });
});

// -------------------------------------
// LISTAR PROFESORES
// -------------------------------------
app.get('/api/profesores', (req, res) => {
  const query = `
SELECT 
  pr.id_profesor,
  pe.id_persona,
  pe.nombre,
  pe.apellido,
  pe.dni,
  pe.fecha_nacimiento,
  pe.direccion,
  pe.telefono,
  es.id_especialidad,
  es.nombre AS especialidad,
  a.id_actividad,
  a.nombre AS nombre_actividad,
  a.categoria,
  a.dia,
  a.horario,
  a.lugar,
  a.precio,
  a.cupo_maximo,
  a.cantidad_anotados,
  us.habilitado
FROM Profesor pr
INNER JOIN Usuario us on pr.id_persona = us.id_persona
INNER JOIN Persona pe ON pr.id_persona = pe.id_persona
INNER JOIN Especialidad es ON pr.id_especialidad = es.id_especialidad
INNER JOIN ProfesorActividad pa ON pr.id_profesor = pa.id_profesor
INNER JOIN Actividad a ON pa.id_actividad = a.id_actividad;`;
  sql.query(connectionString, query, (err, rows) => {
    if (err) return res.status(500).send("Error al listar profesores");
    res.json(rows);
  });
});

// -------------------------------------
// ELIMINAR PROFESOR
// -------------------------------------
app.delete('/api/profesores/:id', (req, res) => {
  const id_profesor = req.params.id;

  sql.open(connectionString, async (err, conn) => {
    if (err) {
      console.error("Error al abrir conexión:", err);
      return res.status(500).json({ mensaje: "Error al conectar con la base de datos" });
    }

    try {
      // Iniciar transacción
      await ejecutarQuery(conn, "BEGIN TRANSACTION");

      // Buscar id_persona del profesor
      const result = await ejecutarQuery(conn, "SELECT id_persona FROM Profesor WHERE id_profesor = ?", [id_profesor]);

      if (result.length === 0) {
        await ejecutarQuery(conn, "ROLLBACK");
        conn.close();
        return res.status(404).json({ mensaje: "Profesor no encontrado" });
      }

      const id_persona = result.recordset[0].id_persona;

      // Eliminar registros relacionados
      await ejecutarQuery(conn, "DELETE FROM ProfesorActividad WHERE id_profesor = ?", [id_profesor]);
      await ejecutarQuery(conn, "DELETE FROM Usuario WHERE id_persona = ?", [id_persona]);
      await ejecutarQuery(conn, "DELETE FROM Profesor WHERE id_profesor = ?", [id_profesor]);
      await ejecutarQuery(conn, "DELETE FROM Persona WHERE id_persona = ?", [id_persona]);

      // Confirmar los cambios
      await ejecutarQuery(conn, "COMMIT");
      conn.close();
      res.status(200).json({ mensaje: "Profesor eliminado correctamente" });

    } catch (error) {
      console.error("Error en la transacción:", error);
      try {
        await ejecutarQuery(conn, "ROLLBACK");
      } catch (rollbackError) {
        console.error("Error durante el rollback:", rollbackError);
      }
      conn.close();
      res.status(500).json({ mensaje: "Error al eliminar profesor" });
    }
  });
});

// -------------------------------------
// MODIFICAR PROFESOR
// -------------------------------------
app.put('/api/profesores/:id', (req, res) => {
  console.log('📥 req.body:', req.body); // DEBUG
  const {
    nombre,
    apellido,
    dni,
    fecha_nacimiento,
    direccion,
    telefono,
    especialidad,
    actividades,
    email,
    contrasena,
  } = req.body;

  const id_profesor = req.params.id;

  if (!nombre || !apellido || !dni || !fecha_nacimiento || !direccion || !telefono || !especialidad || !Array.isArray(actividades) || actividades.length === 0) {
    return res.status(400).json({ mensaje: 'Faltan datos obligatorios' });
  }

  // Buscar id_persona asociado al profesor
  const buscarPersona = `
    SELECT p.id_persona FROM Persona p
    INNER JOIN Profesor pr ON p.id_persona = pr.id_persona
    WHERE pr.id_profesor = ?
  `;

  sql.query(connectionString, buscarPersona, [id_profesor], (err, result) => {
    if (err) return res.status(500).send("Error al buscar persona del profesor");
    if (result.length === 0) return res.status(404).send("Profesor no encontrado");

    const id_persona = result[0].id_persona;

    // 2. Buscar ID de la especialidad
    const buscarEspecialidad = "SELECT id_especialidad FROM Especialidad WHERE nombre = ?";
    sql.query(connectionString, buscarEspecialidad, [especialidad], (err2, resultEsp) => {
      if (err2) return res.status(500).send("Error al buscar especialidad");

      if (resultEsp.length === 0) return res.status(400).send("Especialidad no encontrada");
      const id_especialidad = resultEsp[0].id_especialidad;

      // 3. Buscar IDs de las actividades
      const placeholders = actividades.map(() => '?').join(',');
      const buscarActividades = `SELECT id_actividad FROM Actividad WHERE id_actividad IN (${placeholders})`;

      sql.query(connectionString, buscarActividades, actividades, (err3, resultAct) => {
        if (err3) return res.status(500).send("Error al buscar actividades");

        if (resultAct.length !== actividades.length) return res.status(400).send("Alguna actividad no fue encontrada");

        const ids_actividades = resultAct.map(a => a.id_actividad);

        // 4. Actualizar Persona
        const actualizarPersona = `
          UPDATE Persona
          SET nombre = ?, apellido = ?, dni = ?, fecha_nacimiento = ?, direccion = ?, telefono = ?
          WHERE id_persona = ?
        `;

        sql.query(connectionString, actualizarPersona,
          [nombre, apellido, dni, fecha_nacimiento, direccion, telefono, id_persona], (err4) => {
            if (err4) return res.status(500).send("Error al actualizar persona");

            // 5. Actualizar Profesor
            const actualizarProfesor = `
              UPDATE Profesor SET id_especialidad = ? WHERE id_profesor = ?
            `;
            sql.query(connectionString, actualizarProfesor, [id_especialidad, id_profesor], (err5) => {
              if (err5) return res.status(500).send("Error al actualizar profesor");

              // 6. Eliminar actividades anteriores
              const eliminarAnterior = `DELETE FROM ProfesorActividad WHERE id_profesor = ?`;
              sql.query(connectionString, eliminarAnterior, [id_profesor], (err6) => {
                if (err6) return res.status(500).send("Error al eliminar actividades anteriores");

                // Insertar nuevas actividades
                const insertarActividad = `
                  INSERT INTO ProfesorActividad (id_profesor, id_actividad) VALUES (?, ?)
                `;

                let errores = 0;
                ids_actividades.forEach((id_actividad, i) => {
                  sql.query(connectionString, insertarActividad, [id_profesor, id_actividad], (err7) => {
                    if (err7) errores++;

                    if (i === ids_actividades.length - 1) {
                      if (errores > 0) return res.status(500).send("Error al asignar nuevas actividades");

                      // 7. Si hay email o contraseña, actualizar Usuario
                      if (email || contrasena) {
                        const campos = [];
                        const valores = [];

                        if (email) {
                          campos.push("email = ?");
                          valores.push(email);
                        }
                        if (contrasena) {
                          campos.push("contraseña = ?");
                          valores.push(contrasena);
                        }

                        const queryUsuario = `UPDATE Usuario SET ${campos.join(', ')} WHERE id_persona = ?`;
                        valores.push(id_persona);

                        sql.query(connectionString, queryUsuario, valores, (err8) => {
                          if (err8) return res.status(500).send("Error al actualizar usuario");
                          return res.status(200).json({ mensaje: "Profesor actualizado correctamente" });
                        });
                      } else {
                          return res.status(200).json({ mensaje: "Profesor actualizado correctamente" });
                      }
                    }
                  });
                });
              });
            });
          });
      });
    });
  });
});


// -------------------------------------
// LOGIN
// -------------------------------------
app.post('/api/login', (req, res) => {
  console.log('📥 req.body:', req.body); // DEBUG

  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ mensaje: 'Faltan email o contraseña' });

  const queryLogin = `
    SELECT u.id_usuario, u.email, p.nombre, p.apellido, r.nombre AS rol
    FROM Usuario u
    INNER JOIN Persona p ON u.id_persona = p.id_persona
    INNER JOIN Rol r ON u.id_rol = r.id_rol
    WHERE u.email = ? AND u.contraseña = ? AND u.habilitado = 1
  `;
  sql.query(connectionString, queryLogin, [email, password], (err, rows) => {
    if (err) return res.status(500).json({ mensaje: 'Error interno del servidor' });
    if (!rows || rows.length === 0) return res.status(401).json({ mensaje: 'Email o contraseña incorrectos o usuario no habilitado' });

    const usuario = rows[0];
    const queryUpdate = "UPDATE Usuario SET ultimo_inicio_sesion = GETDATE() WHERE id_usuario = ?";
    sql.query(connectionString, queryUpdate, [usuario.id_usuario], (errUpdate) => {
      if (errUpdate) console.error('⚠️ Error al actualizar último inicio de sesión:', errUpdate);
      res.json({
        mensaje: 'Login exitoso',
        usuario: {
          id: usuario.id_usuario,
          email: usuario.email,
          nombre: usuario.nombre,
          apellido: usuario.apellido,
          rol: usuario.rol,
        }
      });
    });
  });
});

// VALIDACIÓN BACKEND
function validarActividad(data) {
  const { nombre, categoria, dia, horario, lugar, precio, cupo_maximo } = data;
  const diasValidos = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  if (!nombre || !categoria || !dia || !horario || !lugar) {
    return 'Todos los campos de texto son obligatorios';
  }
  if (!diasValidos.includes(dia)) {
    return 'Día no válido. Debe ser uno de: ' + diasValidos.join(', ');
  }
  if (typeof precio !== 'number' || precio < 0) {
    return 'El precio debe ser un número positivo';
  }
  if (typeof cupo_maximo !== 'number' || cupo_maximo < 0) {
    return 'El cupo máximo debe ser un número positivo';
  }
  return null;
}

// RUTAS
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

app.post('/api/actividades', (req, res) => {
  const error = validarActividad(req.body);
  if (error) return res.status(400).send(error);

  const { nombre, categoria, dia, horario, lugar, precio, cupo_maximo } = req.body;
  const query = `
    INSERT INTO Actividad (nombre, categoria, dia, horario, lugar, precio, cupo_maximo, cantidad_anotados)
    OUTPUT INSERTED.*
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `;
  const params = [nombre, categoria, dia, horario, lugar, precio, cupo_maximo];

  sql.query(connectionString, query, params, (err, rows) => {
    if (err) {
      console.error('Error al insertar actividad:', err);
      res.status(500).send('Error al insertar actividad');
    } else {
      res.status(201).json(rows[0]);
    }
  });
});

app.put('/api/actividades/:id', (req, res) => {
  const error = validarActividad(req.body);
  if (error) return res.status(400).send(error);

  const id = req.params.id;
  const { nombre, categoria, dia, horario, lugar, precio, cupo_maximo } = req.body;
  const query = `
    UPDATE Actividad
    SET nombre = ?, categoria = ?, dia = ?, horario = ?, lugar = ?, precio = ?, cupo_maximo = ?
    OUTPUT INSERTED.*
    WHERE id_actividad = ?
  `;
  const params = [nombre, categoria, dia, horario, lugar, precio, cupo_maximo, id];

  sql.query(connectionString, query, params, (err, rows) => {
    if (err) {
      console.error('Error al modificar actividad:', err);
      res.status(500).send('Error al modificar actividad');
    } else if (rows.length === 0) {
      res.status(404).send('Actividad no encontrada');
    } else {
      res.json(rows[0]);
    }
  });
});

app.delete('/api/actividades/:id', (req, res) => {
  const id = req.params.id;
  const verificarQuery = 'SELECT * FROM Actividad WHERE id_actividad = ?';
  sql.query(connectionString, verificarQuery, [id], (err, rows) => {
    if (err) {
      console.error('Error al verificar actividad:', err);
      return res.status(500).send('Error al verificar actividad');
    }

    if (rows.length === 0) {
      return res.status(404).send('Actividad no encontrada');
    }

    const deleteQuery = 'DELETE FROM Actividad WHERE id_actividad = ?';
    sql.query(connectionString, deleteQuery, [id], (err2) => {
      if (err2) {
        console.error('Error al eliminar actividad:', err2);
        res.status(500).send('Error al eliminar actividad');
      } else {
        res.status(200).json({ mensaje: 'Actividad eliminada', actividad: rows[0] });
      }
    });
  });
});

// function ejecutarQuery(conn, query, params) {
//   return new Promise((resolve, reject) => {
//     conn.query(query, params, (err, result) => {
//       if (err) return reject(err);
//       resolve(result);
//     });
//   });
// }
function ejecutarQuery(conn, query, params = []) {
  return new Promise((resolve, reject) => {
    if (!conn) return reject(new Error("Conexión inválida"));
    conn.query(query, params, (err, rows) => {
      if (err) return reject(err);
      resolve({ recordset: rows });
    });
  });
}
// -------------------------------------
// INICIAR SERVIDOR
// -------------------------------------
app.listen(PORT, () => {
  console.log(`✅ Servidor backend escuchando en http://localhost:${PORT}`);
});

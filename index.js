const express = require('express');
const cors = require('cors');
const sql = require('msnodesqlv8');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Cadena de conexión
const connectionString = 'Driver={ODBC Driver 17 for SQL Server};Server=localhost\\SQLEXPRESS;Database=ClubTitanes;Trusted_Connection=Yes;';

// -------------------------------------
// OBTENER ACTIVIDADES
// -------------------------------------

app.get('/api/actividades', (req, res) => {
  const query = "SELECT id_actividad, nombre + ' - ' + dia + ' - ' + horario AS nombre_actividad FROM Actividad";
  sql.query(connectionString, query, (err, rows) => {
    if (err) return res.status(500).send("Error al obtener actividades");
    res.json(rows);
  });
});



// -------------------------------------
// REGISTRAR PROFESOR
// -------------------------------------
app.post('/api/profesores', async (req, res) => {
  const { nombre, apellido, dni, fecha_nacimiento, direccion, telefono, email, contraseña, especialidad, actividades } = req.body;
  if (!nombre || !apellido || !dni || !fecha_nacimiento || !direccion || !telefono || !email || !contraseña || !especialidad || !Array.isArray(actividades) || actividades.length === 0) {
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

      const id_persona = insertPersona[0].id_persona;

      // Obtener id_especialidad desde su nombre
      const espRes = await ejecutarQuery(conn, `SELECT id_especialidad FROM Especialidad WHERE nombre = ?`, [especialidad]);
      if (espRes.length === 0) throw new Error("Especialidad no encontrada");
      const id_especialidad = espRes[0].id_especialidad;

      // Insertar profesor
      const insertProfesor = await ejecutarQuery(conn, `
        INSERT INTO Profesor (id_persona, id_especialidad)
        OUTPUT INSERTED.id_profesor
        VALUES (?, ?)`, [id_persona, id_especialidad]);  

      const id_profesor = insertProfesor[0].id_profesor;

      // Insertar usuario
      await ejecutarQuery(conn, `
        INSERT INTO Usuario (id_persona, email, contraseña, id_rol, habilitado, fecha_de_registro, ultimo_inicio_sesion)
        VALUES (?, ?, ?, 2, 1, GETDATE(), GETDATE())`, [id_persona, email, contraseña]);

      // Obtener ids de las actividades por su nombre
      for (const nombreActividad of actividades) {
        const actRes = await ejecutarQuery(conn, `SELECT id_actividad FROM Actividad WHERE nombre = ?`, [nombreActividad]);
        if (actRes.length === 0) throw new Error(`Actividad no encontrada: ${nombreActividad}`);

        const id_actividad = actRes[0].id_actividad;
        await ejecutarQuery(conn, `INSERT INTO ProfesorActividad (id_profesor, id_actividad) VALUES (?, ?)`, [id_profesor, id_actividad]);
      }

      res.status(200).json({ mensaje: 'Profesor registrado exitosamente' });
    } catch (error) {
      res.status(500).json({ mensaje: 'Error al registrar profesor', error });
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

      const id_persona = result[0].id_persona;

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
    contraseña,
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
      const buscarActividades = `SELECT id_actividad FROM Actividad WHERE nombre IN (${placeholders})`;

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
                      if (email || contraseña) {
                        const campos = [];
                        const valores = [];

                        if (email) {
                          campos.push("email = ?");
                          valores.push(email);
                        }
                        if (contraseña) {
                          campos.push("contraseña = ?");
                          valores.push(contraseña);
                        }

                        const queryUsuario = `UPDATE Usuario SET ${campos.join(', ')} WHERE id_persona = ?`;
                        valores.push(id_persona);

                        sql.query(connectionString, queryUsuario, valores, (err8) => {
                          if (err8) return res.status(500).send("Error al actualizar usuario");
                          return res.send("Profesor actualizado correctamente");
                        });
                      } else {
                        return res.send("Profesor actualizado correctamente");
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

function ejecutarQuery(conn, query, params) {
  return new Promise((resolve, reject) => {
    conn.query(query, params, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

// -------------------------------------
// INICIAR SERVIDOR
// -------------------------------------
app.listen(PORT, () => {
  console.log(`✅ Servidor backend escuchando en http://localhost:${PORT}`);
});
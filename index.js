const express = require('express');
const cors = require('cors');
const sql = require('msnodesqlv8');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Cadena de conexión
const connectionString = 'Driver={ODBC Driver 17 for SQL Server};Server=DESKTOP-FF290ON\\SQLEXPRESS;Database=ClubTitanes;Trusted_Connection=Yes;';

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
app.post('/api/profesores', (req, res) => {
  const { nombre, apellido, dni, fecha_nacimiento, direccion, telefono, especialidad, email, contraseña, id_actividad } = req.body;
  if (!nombre || !apellido || !dni || !fecha_nacimiento || !direccion || !telefono || !especialidad || !email || !contraseña || !id_actividad) {
    return res.status(400).json({ mensaje: 'Faltan datos obligatorios' });
  }

  const checkDniQuery = "SELECT id_persona FROM Persona WHERE dni = ?";
  sql.query(connectionString, checkDniQuery, [dni], (err, dniResult) => {
    if (err) return res.status(500).send("Error al verificar DNI");
    if (dniResult.length > 0) return res.status(409).json({ mensaje: 'El DNI ya está registrado' });

    const checkEmailQuery = "SELECT id_usuario FROM Usuario WHERE email = ?";
    sql.query(connectionString, checkEmailQuery, [email], (err2, emailResult) => {
      if (err2) return res.status(500).send("Error al verificar email");
      if (emailResult.length > 0) return res.status(409).json({ mensaje: 'El email ya está registrado' });

      const insertPersona = `
        INSERT INTO Persona (nombre, apellido, dni, fecha_nacimiento, direccion, telefono)
        OUTPUT INSERTED.id_persona
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      sql.query(connectionString, insertPersona, [nombre, apellido, dni, fecha_nacimiento, direccion, telefono], (err3, personaRes) => {
        if (err3) return res.status(500).send("Error al insertar persona");
        const id_persona = personaRes[0].id_persona;

        const insertProfesor = `
          INSERT INTO Profesor (id_persona, especialidad)
          OUTPUT INSERTED.id_profesor
          VALUES (?, ?)
        `;
        sql.query(connectionString, insertProfesor, [id_persona, especialidad], (err4, profRes) => {
          if (err4) return res.status(500).send("Error al insertar profesor");
          const id_profesor = profRes[0].id_profesor;

          const insertUsuario = `
            INSERT INTO Usuario (id_persona, email, contraseña, id_rol, habilitado, fecha_de_registro, ultimo_inicio_sesion)
            VALUES (?, ?, ?, 3, 1, GETDATE(), GETDATE())
          `;
          sql.query(connectionString, insertUsuario, [id_persona, email, contraseña], (err5) => {
            if (err5) return res.status(500).send("Error al insertar usuario");

            const insertAsignacion = `
              INSERT INTO Asignacion_Profesor (id_profesor, id_actividad)
              VALUES (?, ?)
            `;
            sql.query(connectionString, insertAsignacion, [id_profesor, id_actividad], (err6) => {
              if (err6) return res.status(500).send("Error al asignar actividad");
              res.status(200).json({ mensaje: 'Profesor registrado exitosamente' });
            });
          });
        });
      });
    });
  });
});

// -------------------------------------
// LISTAR PROFESORES
// -------------------------------------
app.get('/api/profesores', (req, res) => {
  const query = `
SELECT 
  pr.id_profesor,
  p.nombre,
  p.apellido,
  p.dni,
  p.fecha_nacimiento,
  p.direccion,
  p.telefono,
  pr.especialidad,
  a.nombre AS actividad,
  u.email,
  u.contraseña
FROM Persona p
INNER JOIN Profesor pr ON pr.id_persona = p.id_persona
INNER JOIN Usuario u ON u.id_persona = p.id_persona
INNER JOIN Asignacion_Profesor ap ON ap.id_profesor = pr.id_profesor
INNER JOIN Actividad a ON a.id_actividad = ap.id_actividad
WHERE u.habilitado = 1;

  `;
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

  const getPersonaId = "SELECT id_persona FROM Profesor WHERE id_profesor = ?";
  sql.query(connectionString, getPersonaId, [id_profesor], (err, result) => {
    if (err) {
      return res.status(500).json({ mensaje: "Error al buscar profesor" });
    }
    if (result.length === 0) {
      return res.status(404).json({ mensaje: "Profesor no encontrado" });
    }

    const id_persona = result[0].id_persona;

    // Empezamos transacción simulada para borrar en orden
    // Primero borramos asignaciones de profesor
    const deleteAsignacion = "DELETE FROM Asignacion_Profesor WHERE id_profesor = ?";
    sql.query(connectionString, deleteAsignacion, [id_profesor], (err2) => {
      if (err2) {
        return res.status(500).json({ mensaje: "Error al eliminar asignaciones" });
      }

      // Luego borramos usuario asociado a la persona
      const deleteUsuario = "DELETE FROM Usuario WHERE id_persona = ?";
      sql.query(connectionString, deleteUsuario, [id_persona], (err3) => {
        if (err3) {
          return res.status(500).json({ mensaje: "Error al eliminar usuario" });
        }

        // Luego borramos profesor
        const deleteProfesor = "DELETE FROM Profesor WHERE id_profesor = ?";
        sql.query(connectionString, deleteProfesor, [id_profesor], (err4) => {
          if (err4) {
            return res.status(500).json({ mensaje: "Error al eliminar profesor" });
          }

          // Finalmente borramos persona
          const deletePersona = "DELETE FROM Persona WHERE id_persona = ?";
          sql.query(connectionString, deletePersona, [id_persona], (err5) => {
            if (err5) {
              return res.status(500).json({ mensaje: "Error al eliminar persona" });
            }

            // Todo eliminado correctamente
            res.status(200).json({ mensaje: "Profesor eliminado correctamente" });
          });
        });
      });
    });
  });
});

// -------------------------------------
// MODIFICAR PROFESOR
// -------------------------------------
app.put('/api/profesores/:id', (req, res) => {
  const id_profesor = req.params.id;
  const {
    nombre,
    apellido,
    dni,
    fecha_nacimiento,
    direccion,
    telefono,
    especialidad,
    id_actividad,
    email,
    contraseña
  } = req.body;

  // Validar datos obligatorios (menos email y contraseña que son opcionales)
  if (
    !nombre ||
    !apellido ||
    !dni ||
    !fecha_nacimiento ||
    !direccion ||
    !telefono ||
    !especialidad ||
    !id_actividad
  ) {
    return res.status(400).json({ mensaje: 'Faltan datos obligatorios' });
  }

  // Buscar id_persona asociado al profesor
  const buscarPersona = `
    SELECT p.id_persona FROM Persona p
    INNER JOIN Profesor pr ON p.id_persona = pr.id_persona
    WHERE pr.id_profesor = ?
  `;

  sql.query(connectionString, buscarPersona, [id_profesor], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Error al buscar persona del profesor");
    }
    if (result.length === 0) return res.status(404).send("Profesor no encontrado");

    const id_persona = result[0].id_persona;

    // Actualizar datos en Persona
    const actualizarPersona = `
      UPDATE Persona
      SET nombre = ?, apellido = ?, dni = ?, fecha_nacimiento = ?, direccion = ?, telefono = ?
      WHERE id_persona = ?
    `;

    sql.query(connectionString, actualizarPersona, [nombre, apellido, dni, fecha_nacimiento, direccion, telefono, id_persona], (err2) => {
      if (err2) {
        console.error(err2);
        return res.status(500).send("Error al actualizar persona");
      }

      // Actualizar especialidad en Profesor
      const actualizarProfesor = `
        UPDATE Profesor
        SET especialidad = ?
        WHERE id_profesor = ?
      `;
      sql.query(connectionString, actualizarProfesor, [especialidad, id_profesor], (err3) => {
        if (err3) {
          console.error(err3);
          return res.status(500).send("Error al actualizar profesor");
        }

        // Actualizar actividad en Asignacion_Profesor
        const actualizarAsignacion = `
          UPDATE Asignacion_Profesor
          SET id_actividad = ?
          WHERE id_profesor = ?
        `;
        sql.query(connectionString, actualizarAsignacion, [id_actividad, id_profesor], (err4) => {
          if (err4) {
            console.error(err4);
            return res.status(500).send("Error al actualizar asignación");
          }

          // Si se envió email o contraseña, actualizar en Usuario
          if (email || contraseña) {
            let queryUsuario = "UPDATE Usuario SET ";
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

            queryUsuario += campos.join(", ") + " WHERE id_persona = ?";
            valores.push(id_persona);

            sql.query(connectionString, queryUsuario, valores, (err5) => {
              if (err5) {
                console.error(err5);
                return res.status(500).send("Error al actualizar usuario");
              }
              // Final exitoso con actualización de usuario
              return res.send("Profesor actualizado correctamente");
            });
          } else {
            // Final exitoso sin actualización de usuario
            return res.send("Profesor actualizado correctamente");
          }
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

// -------------------------------------
// INICIAR SERVIDOR
// -------------------------------------
app.listen(PORT, () => {
  console.log(`✅ Servidor backend escuchando en http://localhost:${PORT}`);
});

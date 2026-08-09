// Carga del .env, DELIBERADAMENTE en su propio modulo.
//
// En ES modules los modulos importados se evaluan ANTES que el cuerpo del que los importa. Con
// dotenv.config() en el cuerpo de index.ts, cualquier constante de modulo que lea process.env se
// evaluaria con el entorno todavia sin cargar. En el monolito no pasaba: dotenv.config() estaba
// unas lineas por encima, en el mismo archivo.
//
// Eso rompio el SSO de Technical: IS_PRODUCTION valia false dentro de un router y true en index.ts.
//
// Este modulo tiene que ser el PRIMER import de index.ts. No mover.
import dotenv from 'dotenv';

dotenv.config();

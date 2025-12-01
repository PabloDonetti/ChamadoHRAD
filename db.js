require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

pool.connect((err) => {
    if (err) {
        console.error('❌ Erro de conexão com o Banco:', err.message);
    } else {
        console.log('✅ Conectado ao PostgreSQL com sucesso!');
    }
});

module.exports = pool;
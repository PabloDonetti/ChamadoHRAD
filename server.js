const express = require('express');
const cors = require('cors');
const pool = require('./db');
const app = express();

app.use(express.json());
app.use(cors());

// Rota de Teste
app.get('/', (req, res) => {
    res.send('Sistema de Chamados HRAD - Backend Funcionando 🚀');
});

// Rota para CRIAR um chamado
app.post('/api/chamados', async (req, res) => {
    const { solicitante, setor, prioridade, titulo, descricao } = req.body;
    try {
        const query = `
            INSERT INTO chamados (solicitante, setor, prioridade, titulo, descricao, data_criacao, status)
            VALUES ($1, $2, $3, $4, $5, NOW(), 'Aberto')
            RETURNING *;
        `;
        const values = [solicitante, setor, prioridade, titulo, descricao];
        const result = await pool.query(query, values);
        
        console.log("Chamado criado:", result.rows[0]);
        return res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Erro ao salvar no banco" });
    }
});

app.get('/api/chamados', async (req, res) => {
    try {
        // Busca tudo e ordena do mais novo para o mais antigo
        const result = await pool.query('SELECT * FROM chamados ORDER BY data_criacao DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro ao buscar chamados" });
    }
});


// Rota para ATUALIZAR o status (Finalizar chamado)
app.patch('/api/chamados/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // Vamos mandar "Resolvido" aqui

    try {
        await pool.query('UPDATE chamados SET status = $1 WHERE id = $2', [status, id]);
        res.json({ message: "Status atualizado!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro ao atualizar status" });
    }
});

// Rota para DELETAR um chamado
app.delete('/api/chamados/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM chamados WHERE id = $1', [id]);
        res.json({ message: "Chamado deletado!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro ao deletar chamado" });
    }
});

app.listen(3000, () => {
    console.log('🚀 Servidor rodando na porta 3000');
});
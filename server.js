const express = require('express');
const cors = require('cors');
const pool = require('./db');
const ActiveDirectory = require('activedirectory2'); // Biblioteca para AD
const app = express();

app.use(express.json());
app.use(cors());

// --- CONFIGURAÇÃO DO ACTIVE DIRECTORY (AD) ---
// Substitua pelos dados reais da rede do hospital quando for para produção
const adConfig = {
    url: 'ldap://192.168.1.5', // IP do Controlador de Domínio
    baseDN: 'dc=hospital,dc=local', // Nome do domínio
    // username: 'admin@hospital.local', // Se necessário usuário para leitura
    // password: 'senha_do_admin' 
};

// Rota de Teste Simples
app.get('/', (req, res) => {
    res.send('Sistema de Chamados HRAD - Backend Funcionando 🚀');
});

// =========================================
// ROTAS DE AUTENTICAÇÃO
// =========================================

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    // 1. LOGIN DE SUPORTE/TESTE (Para você usar sem a rede do hospital)
    if (email === 'admin' && password === '1234') {
        return res.json({ 
            success: true, 
            user: { nome: 'Administrador Local', setor: 'TI', cargo: 'Admin' } 
        });
    }

    // 2. TENTATIVA REAL NO WINDOWS SERVER (AD)
    try {
        const ad = new ActiveDirectory(adConfig);
        const usernameDomain = `${email}@hospital.local`; // Ajuste o sufixo conforme o domínio real

        ad.authenticate(usernameDomain, password, function(err, auth) {
            if (err) {
                console.log('Erro AD:', err);
                // Retorna erro, mas em produção verifique se é erro de conexão ou senha
                return res.status(401).json({ error: "Erro de autenticação ou Falha no AD" });
            }

            if (auth) {
                console.log('Usuário autenticado no AD:', email);
                return res.json({ 
                    success: true, 
                    user: { nome: email, setor: 'Hospital', cargo: 'Funcionário' } 
                });
            } else {
                return res.status(401).json({ error: "Usuário ou senha incorretos" });
            }
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Erro interno no servidor de login" });
    }
});

// =========================================
// ROTAS DE CHAMADOS
// =========================================

// 1. CRIAR CHAMADO
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
        return res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Erro ao salvar no banco" });
    }
});

// 2. LISTAR TODOS OS CHAMADOS (Ordenados por Prioridade)
app.get('/api/chamados', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM chamados 
            ORDER BY 
                CASE WHEN prioridade = 'Muito Alta' THEN 1
                     WHEN prioridade = 'Alta' THEN 2 
                     WHEN prioridade = 'Média' THEN 3 
                     ELSE 4 
                END,
                data_criacao DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Erro ao buscar chamados" });
    }
});

// 3. PEGAR UM CHAMADO ESPECÍFICO (Detalhes)
app.get('/api/chamados/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM chamados WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Chamado não encontrado" });
        }
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Erro ao buscar detalhes" });
    }
});

// 4. RESOLVER CHAMADO (Salvar solução técnica)
app.put('/api/chamados/:id/resolver', async (req, res) => {
    const { id } = req.params;
    const { tecnico, solucao, tempo_gasto } = req.body;

    try {
        await pool.query(
            `UPDATE chamados 
             SET status = 'Resolvido', 
                 tecnico = $1, 
                 solucao = $2, 
                 tempo_gasto = $3, 
                 data_fechamento = NOW() 
             WHERE id = $4`,
            [tecnico, solucao, tempo_gasto, id]
        );
        res.json({ message: "Chamado resolvido com sucesso!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro ao resolver chamado" });
    }
});

// 5. ATUALIZAR STATUS RÁPIDO (Da lista)
app.patch('/api/chamados/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; 

    try {
        await pool.query('UPDATE chamados SET status = $1 WHERE id = $2', [status, id]);
        res.json({ message: "Status atualizado!" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro ao atualizar status" });
    }
});

// 6. DELETAR CHAMADO
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

// =========================================
// ROTAS DE ESTATÍSTICAS (DASHBOARD)
// =========================================

app.get('/api/dashboard-stats', async (req, res) => {
    try {
        // Estatísticas Gerais
        const totalQuery = await pool.query('SELECT COUNT(*) FROM chamados');
        
        const mesQuery = await pool.query(`
            SELECT COUNT(*) FROM chamados 
            WHERE EXTRACT(MONTH FROM data_criacao) = EXTRACT(MONTH FROM CURRENT_DATE)
            AND EXTRACT(YEAR FROM data_criacao) = EXTRACT(YEAR FROM CURRENT_DATE)
        `);
        
        const hojeQuery = await pool.query(`
            SELECT COUNT(*) FROM chamados 
            WHERE data_criacao::date = CURRENT_DATE
        `);
        
        const abertosQuery = await pool.query(`
            SELECT COUNT(*) FROM chamados WHERE status != 'Resolvido'
        `);

        // Lista de "Atenção Prioritária" (Todos os não resolvidos, ordenados por urgência)
        const urgentesQuery = await pool.query(`
            SELECT * FROM chamados 
            WHERE status != 'Resolvido'
            ORDER BY 
                CASE WHEN prioridade = 'Muito Alta' THEN 1
                     WHEN prioridade = 'Alta' THEN 2 
                     WHEN prioridade = 'Média' THEN 3 
                     ELSE 4 
                END,
                data_criacao ASC
        `);

        res.json({
            total: totalQuery.rows[0].count,
            mes: mesQuery.rows[0].count,
            hoje: hojeQuery.rows[0].count,
            abertos: abertosQuery.rows[0].count,
            urgentes: urgentesQuery.rows
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro ao carregar estatísticas" });
    }
});

// Inicia o servidor
app.listen(3000, () => {
    console.log('🚀 Servidor rodando na porta 3000');
});
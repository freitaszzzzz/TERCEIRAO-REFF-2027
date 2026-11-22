# 🎓 Portal do Terceirão 2027

Aplicação web completa para organização de turma do 3º ano do Ensino Médio, com sincronização em tempo real via **Firebase (Authentication + Cloud Firestore + Hosting)**, controle de permissões por cargo (**Visitante / Aluno / Admin**) e modo claro/escuro responsivo.

---

## ✨ Funcionalidades

### 📊 Visão Geral
- Contagens regressivas configuráveis (Formatura e Interclasse).
- Cards de resumo em tempo real (caixa da formatura, pedidos de camisa, próximo trote e enquetes).
- Mural de avisos oficiais com botão de cópia formatada para WhatsApp.
- Feed automático de próximos eventos.

### 💰 Formatura
- **Caixa & Progresso:** acompanhamento em tempo real do saldo, barra de progresso da meta, gráfico de arrecadação por origem, simulador de valor por aluno/mês e extrato de entradas e saídas.
- **Planejamento da Festa:** controle de fornecedores, orçamentos estimados e status de negociação.

### 🏆 Interclasse
- **Camisas (Nome & Tamanho):** área pública autenticada onde cada aluno cadastra e edita **somente a própria camisa** (nome nas costas, número e tamanho), com resumo automático da grade para envio à malharia.
- **Datas dos Jogos:** calendário de partidas agrupado e filtrável por modalidade, com placar e resultado.
- **Times & Jogadores:** gestão de modalidades, capitães e escalações visíveis para toda a turma.
- **Modelos & Anotações:** galeria com zoom em tela cheia, votação em tempo real (1 voto por conta), anotações e checklist da torcida.

### 🎭 Trotes & Eventos
- **Calendário de Trotes:** calendário mensal interativo com marcação por status (*Planejado*, *Confirmado*, *Realizado*) e cópia de convite para WhatsApp.
- **Ideias & Regras:** banco de sugestões de temas e regras combinadas com a escola.

### 🧩 Organização
- **Enquetes da Sala:** votações democráticas com 1 voto por usuário e atualização instantânea das porcentagens.
- **Alunos & Funções:** diretório completo da turma com cargos na comissão.
- **Comissão & Tarefas:** quadro Kanban (*A Fazer*, *Em Andamento*, *Concluído*) e atas de reunião.

### 🛡️ Administração (Exclusivo para Organizadores)
- **Gerenciar Acessos:** painel para pré-cadastrar e-mails ou telefones, promover alunos a **Admin** ou rebaixar permissões.

---

## 🔐 Segurança & Controle de Acesso (RBAC)

As permissões são aplicadas tanto na interface quanto no servidor através do arquivo [`firestore.rules`](./firestore.rules):

| Papel | Permissões |
| :--- | :--- |
| **Visitante (sem login)** | Somente visualização de todas as abas públicas. |
| **Aluno (autenticado)** | Visualização geral + editar **apenas o próprio registro** de camisa + 1 voto por enquete/modelo de camiseta. |
| **Admin (Organizador)** | Controle total de criação, edição e exclusão em todas as abas + gestão de acessos. |

- Suporte a login com **E-mail ou Telefone + Senha** utilizando Firebase Authentication.
- **Bootstrap seguro:** a primeira conta criada em um banco recém-inicializado recebe permissão de Admin automaticamente via transação atômica (`meta/bootstrap`).

---

## 🛠️ Tecnologias Utilizadas
- **HTML5, CSS3** (Design System próprio com variáveis CSS, tema Dark/Light e layout responsivo)
- **JavaScript (Vanilla ES)** com carregamento modular dinâmico do **Firebase Web SDK v11**
- **Firebase Authentication** (E-mail/Senha)
- **Cloud Firestore** (listeners em tempo real com `onSnapshot` + Security Rules)
- **Firebase Hosting**

---

## 🚀 Como executar localmente

1. Clone o repositório:
   ```bash
   git clone https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
   ```
2. Copie o arquivo de exemplo de configuração:
   ```bash
   cp firebase-config.example.js firebase-config.js
   ```
3. **Testar rápido (sem configurar Firebase):** abra o `index.html` no navegador — o site detecta automaticamente as chaves de exemplo e inicia em **Modo Prévia Local** (usando `localStorage`).
4. **Conectar ao seu Firebase:** substitua as chaves em `firebase-config.js` pelas do seu projeto e siga o guia em [`README_FIREBASE.md`](./README_FIREBASE.md).

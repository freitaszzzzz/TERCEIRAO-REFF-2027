# Como colocar o Portal do Terceirão 2027 no ar com Firebase

O site já está 100% preparado para **Firebase Authentication + Cloud Firestore + Firebase Hosting**, com regras de segurança prontas em `firestore.rules`.

---

## Passo 1 — Criar o projeto gratuito no Firebase
1. Acesse [console.firebase.google.com](https://console.firebase.google.com) com sua conta Google.
2. Clique em **Adicionar projeto** (ex: `terceirao-refferencial-2027`) e conclua (plano gratuito **Spark**).

## Passo 2 — Ativar Login (E-mail / Senha)
1. No menu esquerdo do Firebase, clique em **Criação (Build) → Authentication → Vamos começar**.
2. Na aba **Sign-in method**, clique em **E-mail/senha**, ative a opção **E-mail/senha** e clique em **Salvar**.
   > Obs.: O login por telefone funciona automaticamente usando este mesmo provedor (sem custo de SMS!).

## Passo 3 — Criar o Banco de Dados (Firestore)
1. No menu esquerdo, clique em **Criação → Firestore Database → Criar banco de dados**.
2. Escolha a região mais próxima (ex: `southamerica-east1` — São Paulo) e selecione **Iniciar no modo de produção**.
3. Depois de criado, clique na aba **Regras (Rules)**, cole todo o conteúdo do arquivo `firestore.rules` desta pasta e clique em **Publicar**.

## Passo 4 — Colar as chaves no arquivo `firebase-config.js`
1. No Firebase Console, clique na engrenagem **⚙ Configurações do projeto**.
2. Em **Seus aplicativos**, clique no ícone **Web (`</>`)**, dê um apelido (ex: `portal-terceirao`) e clique em **Registrar app**.
3. Copie os valores de `firebaseConfig` (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`) e cole no arquivo `firebase-config.js`.

## Passo 5 — Publicar o site na internet (Firebase Hosting)
Abra o PowerShell dentro da pasta `TERCEIRÃO` e rode:

```powershell
npx -y firebase-tools@latest login
npx -y firebase-tools@latest use --add
npx -y firebase-tools@latest deploy
```

No final, o terminal vai mostrar o link público do site (ex: `https://seu-projeto.web.app`)!

---

## Primeiro acesso (Quem vira Admin?)
1. Assim que o site entrar no ar, **VOCÊ (organizador)** deve clicar em **Entrar / Cadastrar → Criar Conta** primeiro.
2. A **primeira conta criada** no banco vazio vira **Admin (Organizador)** automaticamente!
3. Depois disso, acesse a aba **Administração → Gerenciar Acessos** para pré-cadastrar ou promover os e-mails/telefones dos outros organizadores como **Admin**. Todos os outros alunos que se cadastrarem entram automaticamente como **Aluno**.

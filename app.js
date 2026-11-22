// ==========================================================================
// TERCEIRÃO 2027 — REFFERENCIAL | PORTAL COM AUTENTICAÇÃO & FIREBASE
// ==========================================================================

(function () {
  "use strict";

  const LOCAL_DB_KEY = "terceirao_2027_clean_v2";
  const LOCAL_SESSION_KEY = "terceirao_2027_session_v2";
  const THEME_KEY = "terceirao_2027_theme";

  const TAB_META = {
    dashboard: ["Visão Geral", "Resumo oficial do Terceirão 2027"],
    "formatura-caixa": ["Formatura — Caixa & Progresso", "Acompanhe arrecadação, meta, gráfico e extrato"],
    "formatura-plano": ["Formatura — Planejamento da Festa", "Fornecedores, orçamentos e etapas da festa"],
    "inter-camisas": ["Interclasse — Camisas (Nome & Tamanho)", "Cadastre e edite o nome e tamanho da sua camisa"],
    "inter-datas": ["Interclasse — Datas dos Jogos", "Calendário de partidas organizado por modalidade"],
    "inter-times": ["Interclasse — Times & Jogadores", "Escalações oficiais por modalidade"],
    "inter-modelos": ["Interclasse — Modelos & Anotações", "Galeria/votação das camisetas e anotações gerais"],
    "trotes-cal": ["Trotes — Calendário 2027", "Datas, temas e status dos trotes da turma"],
    "trotes-ideias": ["Trotes — Ideias & Regras", "Banco de ideias de temas e regras combinadas"],
    "org-enquetes": ["Organização — Enquetes da Sala", "Votações abertas para os alunos cadastrados"],
    "org-alunos": ["Organização — Alunos & Funções", "Lista completa dos alunos da sala e suas funções"],
    "org-tarefas": ["Organização — Comissão & Tarefas", "Quadro de atividades da comissão e atas de reunião"],
    "admin-acessos": ["Administração — Gerenciar Acessos", "Controle de e-mails e telefones de Alunos e Admins"]
  };

  // Estado vazio (ZERO dados de exemplo!)
  function createEmptyData() {
    return {
      settings: {
        className: "3º Ano • Refferencial",
        graduationDate: "",
        interclasseDate: "",
        financeGoal: 0,
        monthlyFee: 0
      },
      notices: [],
      financeTransactions: [],
      formaturaPlans: [],
      shirtOrders: [],
      interclasseSports: [],
      interclasseGames: [],
      interclasseNotes: [],
      shirtModels: [],
      shirtVotes: [],
      trotes: [],
      troteIdeas: [],
      polls: [],
      pollVotes: {}, // { [pollId]: [{ uid, optionId, voterName }] }
      classMembers: [],
      tasks: [],
      meetings: [],
      accessRoles: []
    };
  }

  let data = createEmptyData();
  let currentUser = null; // { uid, fullName, displayContact, authEmail, role: 'admin' | 'aluno' }
  let activeTab = "dashboard";
  let calendarYear = 2027;
  let calendarMonth = 0; // Janeiro 2027
  let isFirebaseMode = false;

  // Firebase runtime refs
  let fbAuth = null;
  let fbDb = null;
  let fbMod = null;
  let unsubs = [];
  let pollVoteUnsubs = {};
  let accessRolesUnsub = null;

  // ==========================================================================
  // HELPERS
  // ==========================================================================
  function uid(prefix = "id") {
    return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  }

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function isAdmin() {
    return Boolean(currentUser && currentUser.role === "admin");
  }

  function isLoggedIn() {
    return Boolean(currentUser && currentUser.uid);
  }

  function normalizeIdentifier(rawInput) {
    const raw = String(rawInput || "").trim();
    if (!raw) return { valid: false, error: "Informe um e-mail ou telefone." };

    if (raw.includes("@")) {
      const email = raw.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { valid: false, error: "Digite um e-mail válido." };
      }
      return { valid: true, type: "email", authEmail: email, displayContact: email };
    }

    const digits = raw.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) {
      return { valid: false, error: "Digite um telefone válido (com DDD) ou um e-mail." };
    }
    return {
      valid: true,
      type: "phone",
      authEmail: `${digits}@tel.terceirao.app`,
      displayContact: raw
    };
  }

  function formatBRL(val) {
    return Number(val || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function formatDateBR(iso) {
    if (!iso) return "A definir";
    const parts = iso.split("-");
    if (parts.length !== 3) return iso;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  function daysUntil(isoDate) {
    if (!isoDate) return null;
    const target = new Date(isoDate + "T00:00:00");
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  }

  function showToast(msg) {
    const container = document.getElementById("toastContainer");
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3400);
  }

  async function copyToClipboard(text, successMsg = "Copiado para o WhatsApp!") {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      showToast(successMsg);
    } catch {
      showToast("Não foi possível copiar automaticamente.");
    }
  }

  function mapAuthError(err) {
    const code = err?.code || "";
    if (code.includes("email-already-in-use")) return "Este e-mail ou telefone já está cadastrado. Tente entrar na aba Entrar.";
    if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
      return "E-mail/telefone ou senha incorretos.";
    }
    if (code.includes("weak-password")) return "A senha precisa ter pelo menos 6 caracteres.";
    if (code.includes("too-many-requests")) return "Muitas tentativas seguidas. Aguarde um instante.";
    if (code.includes("permission-denied")) return "Você não tem permissão para esta ação.";
    return err?.message || "Ocorreu um erro. Tente novamente.";
  }

  // ==========================================================================
  // BACKEND ABSTRACTION (REAL FIREBASE vs LOCAL PREVIEW FALLBACK)
  // ==========================================================================
  function readLocalStore() {
    try {
      const raw = localStorage.getItem(LOCAL_DB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          ...createEmptyData(),
          ...parsed,
          settings: { ...createEmptyData().settings, ...(parsed.settings || {}) },
          localAccounts: parsed.localAccounts || {},
          bootstrapDone: Boolean(parsed.bootstrapDone)
        };
      }
    } catch (e) {
      console.warn("Erro lendo prévia local:", e);
    }
    return { ...createEmptyData(), localAccounts: {}, bootstrapDone: false };
  }

  function writeLocalStore(store) {
    localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(store));
    syncStateFromLocalStore(store);
  }

  function syncStateFromLocalStore(store) {
    data = {
      settings: store.settings,
      notices: store.notices || [],
      financeTransactions: store.financeTransactions || [],
      formaturaPlans: store.formaturaPlans || [],
      shirtOrders: store.shirtOrders || [],
      interclasseSports: store.interclasseSports || [],
      interclasseGames: store.interclasseGames || [],
      interclasseNotes: store.interclasseNotes || [],
      shirtModels: store.shirtModels || [],
      shirtVotes: store.shirtVotes || [],
      trotes: store.trotes || [],
      troteIdeas: store.troteIdeas || [],
      polls: store.polls || [],
      pollVotes: store.pollVotes || {},
      classMembers: store.classMembers || [],
      tasks: store.tasks || [],
      meetings: store.meetings || [],
      accessRoles: store.accessRoles || []
    };

    if (currentUser) {
      const roleRec = data.accessRoles.find((r) => r.authEmail === currentUser.authEmail);
      if (roleRec) {
        currentUser.role = roleRec.role;
        currentUser.fullName = roleRec.fullName || currentUser.fullName;
      }
    }
    renderAll();
  }

  const dbApi = {
    async saveSettings(patch) {
      if (!isAdmin()) throw new Error("Apenas organizadores podem alterar configurações.");
      if (isFirebaseMode) {
        const { doc, setDoc } = fbMod.fs;
        await setDoc(doc(fbDb, "settings", "general"), { ...data.settings, ...patch, updatedAt: new Date().toISOString() }, { merge: true });
      } else {
        const s = readLocalStore();
        s.settings = { ...s.settings, ...patch };
        writeLocalStore(s);
      }
    },

    async addDoc(colName, item, customId = null) {
      const docId = customId || uid(colName.slice(0, 3));
      const { id: _omitId, ...cleanItem } = item || {};
      const fsPayload = { ...cleanItem, updatedAt: new Date().toISOString() };
      if (isFirebaseMode) {
        const { doc, setDoc } = fbMod.fs;
        await setDoc(doc(fbDb, colName, docId), fsPayload);
      } else {
        const s = readLocalStore();
        s[colName] = Array.isArray(s[colName]) ? s[colName] : [];
        const localPayload = { ...fsPayload, id: docId };
        const idx = s[colName].findIndex((x) => x.id === docId);
        if (idx >= 0) s[colName][idx] = localPayload;
        else s[colName].unshift(localPayload);
        writeLocalStore(s);
      }
      return docId;
    },

    async updateDoc(colName, docId, patch) {
      const { id: _omitId, ...cleanPatch } = patch || {};
      const payload = { ...cleanPatch, updatedAt: new Date().toISOString() };
      if (isFirebaseMode) {
        const { doc, setDoc } = fbMod.fs;
        await setDoc(doc(fbDb, colName, docId), payload, { merge: true });
      } else {
        const s = readLocalStore();
        const arr = s[colName] || [];
        const idx = arr.findIndex((x) => x.id === docId);
        if (idx >= 0) {
          arr[idx] = { ...arr[idx], ...payload };
          writeLocalStore(s);
        }
      }
    },

    async deleteDoc(colName, docId) {
      if (isFirebaseMode) {
        const { doc, deleteDoc } = fbMod.fs;
        await deleteDoc(doc(fbDb, colName, docId));
      } else {
        const s = readLocalStore();
        s[colName] = (s[colName] || []).filter((x) => x.id !== docId);
        if (colName === "polls" && s.pollVotes) delete s.pollVotes[docId];
        writeLocalStore(s);
      }
    },

    async saveShirtOrder(orderId, payload) {
      if (!isAdmin() && (!isLoggedIn() || orderId !== currentUser.uid)) {
        throw new Error("Você só pode editar a sua própria camisa.");
      }
      await this.addDoc("shirtOrders", payload, orderId);
    },

    async voteShirt(modelId) {
      if (!isLoggedIn()) throw new Error("Faça login para votar.");
      const voteDoc = {
        uid: currentUser.uid,
        modelId,
        voterName: currentUser.fullName,
        updatedAt: new Date().toISOString()
      };
      if (isFirebaseMode) {
        const { doc, setDoc } = fbMod.fs;
        await setDoc(doc(fbDb, "shirtVotes", currentUser.uid), voteDoc);
      } else {
        const s = readLocalStore();
        s.shirtVotes = (s.shirtVotes || []).filter((v) => v.uid !== currentUser.uid);
        s.shirtVotes.push({ id: currentUser.uid, ...voteDoc });
        writeLocalStore(s);
      }
    },

    async votePoll(pollId, optionId) {
      if (!isLoggedIn()) throw new Error("Faça login para votar.");
      const voteDoc = {
        uid: currentUser.uid,
        optionId,
        voterName: currentUser.fullName,
        pollId,
        updatedAt: new Date().toISOString()
      };
      if (isFirebaseMode) {
        const { doc, setDoc } = fbMod.fs;
        await setDoc(doc(fbDb, "polls", pollId, "votes", currentUser.uid), voteDoc);
      } else {
        const s = readLocalStore();
        s.pollVotes = s.pollVotes || {};
        const arr = (s.pollVotes[pollId] || []).filter((v) => v.uid !== currentUser.uid);
        arr.push({ id: currentUser.uid, ...voteDoc });
        s.pollVotes[pollId] = arr;
        writeLocalStore(s);
      }
    },

    async setAccessRole(authEmail, payload) {
      if (!isAdmin()) throw new Error("Apenas admins podem gerenciar acessos.");
      const cleanId = authEmail.toLowerCase();
      const fsRecord = {
        authEmail: cleanId,
        displayContact: payload.displayContact || cleanId,
        fullName: payload.fullName || "",
        role: payload.role === "admin" ? "admin" : "aluno",
        uid: payload.uid || "",
        updatedAt: new Date().toISOString()
      };
      if (isFirebaseMode) {
        const { doc, setDoc } = fbMod.fs;
        await setDoc(doc(fbDb, "accessRoles", cleanId), fsRecord, { merge: true });
      } else {
        const s = readLocalStore();
        const localRecord = { id: cleanId, ...fsRecord };
        const idx = (s.accessRoles || []).findIndex((r) => r.authEmail === cleanId);
        if (idx >= 0) s.accessRoles[idx] = { ...s.accessRoles[idx], ...localRecord };
        else s.accessRoles.unshift(localRecord);
        writeLocalStore(s);
      }
    },

    async deleteAccessRole(authEmail) {
      if (!isAdmin()) throw new Error("Apenas admins podem remover acessos.");
      const cleanId = authEmail.toLowerCase();
      if (currentUser && currentUser.authEmail === cleanId) {
        throw new Error("Você não pode remover o seu próprio acesso de admin.");
      }
      if (isFirebaseMode) {
        const { doc, deleteDoc } = fbMod.fs;
        await deleteDoc(doc(fbDb, "accessRoles", cleanId));
      } else {
        const s = readLocalStore();
        s.accessRoles = (s.accessRoles || []).filter((r) => r.authEmail !== cleanId);
        writeLocalStore(s);
      }
    }
  };

  // ==========================================================================
  // AUTH OPERATIONS (CADASTRO, LOGIN, LOGOUT)
  // ==========================================================================
  async function registerAccount({ fullName, identifier, password }) {
    const name = String(fullName || "").trim();
    if (name.length < 3) throw new Error("Informe seu nome completo.");
    if (String(password || "").length < 6) throw new Error("A senha precisa ter no mínimo 6 caracteres.");
    const parsed = normalizeIdentifier(identifier);
    if (!parsed.valid) throw new Error(parsed.error);

    if (isFirebaseMode) {
      const { createUserWithEmailAndPassword, updateProfile } = fbMod.auth;
      const { doc, getDoc, setDoc, writeBatch } = fbMod.fs;

      const cred = await createUserWithEmailAndPassword(fbAuth, parsed.authEmail, password);
      await updateProfile(cred.user, { displayName: name });

      const userUid = cred.user.uid;
      const bootstrapRef = doc(fbDb, "meta", "bootstrap");
      const roleRef = doc(fbDb, "accessRoles", parsed.authEmail);
      const [bootSnap, roleSnap] = await Promise.all([getDoc(bootstrapRef), getDoc(roleRef)]);

      if (!bootSnap.exists()) {
        // Primeiro usuário do portal se torna Admin fundador!
        const batch = writeBatch(fbDb);
        batch.set(bootstrapRef, {
          initialized: true,
          firstAdminUid: userUid,
          firstAdminEmail: parsed.authEmail,
          createdAt: new Date().toISOString()
        });
        batch.set(roleRef, {
          authEmail: parsed.authEmail,
          displayContact: parsed.displayContact,
          fullName: name,
          role: "admin",
          uid: userUid,
          updatedAt: new Date().toISOString()
        });
        await batch.commit();
        return "admin";
      }

      if (roleSnap.exists()) {
        // Já foi pré-autorizado por um admin (pode ser admin ou aluno)
        const existingRole = roleSnap.data().role === "admin" ? "admin" : "aluno";
        await setDoc(
          roleRef,
          {
            authEmail: parsed.authEmail,
            displayContact: parsed.displayContact,
            fullName: name,
            role: existingRole,
            uid: userUid,
            updatedAt: new Date().toISOString()
          },
          { merge: true }
        );
        return existingRole;
      }

      // Cadastro padrão como aluno
      await setDoc(roleRef, {
        authEmail: parsed.authEmail,
        displayContact: parsed.displayContact,
        fullName: name,
        role: "aluno",
        uid: userUid,
        updatedAt: new Date().toISOString()
      });
      return "aluno";
    }

    // Modo Prévia Local
    const s = readLocalStore();
    if (s.localAccounts[parsed.authEmail]) {
      throw new Error("Este e-mail ou telefone já está cadastrado. Faça login na aba Entrar.");
    }
    const newUid = uid("usr");
    const preAuth = (s.accessRoles || []).find((r) => r.authEmail === parsed.authEmail);
    let assignedRole = "aluno";
    if (!s.bootstrapDone) {
      assignedRole = "admin";
      s.bootstrapDone = true;
    } else if (preAuth) {
      assignedRole = preAuth.role === "admin" ? "admin" : "aluno";
    }

    s.localAccounts[parsed.authEmail] = {
      uid: newUid,
      fullName: name,
      authEmail: parsed.authEmail,
      displayContact: parsed.displayContact,
      password
    };

    const roleObj = {
      id: parsed.authEmail,
      authEmail: parsed.authEmail,
      displayContact: parsed.displayContact,
      fullName: name,
      role: assignedRole,
      uid: newUid,
      updatedAt: new Date().toISOString()
    };
    const rIdx = s.accessRoles.findIndex((r) => r.authEmail === parsed.authEmail);
    if (rIdx >= 0) s.accessRoles[rIdx] = roleObj;
    else s.accessRoles.unshift(roleObj);

    currentUser = {
      uid: newUid,
      fullName: name,
      displayContact: parsed.displayContact,
      authEmail: parsed.authEmail,
      role: assignedRole
    };
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(currentUser));
    writeLocalStore(s);
    return assignedRole;
  }

  async function loginAccount({ identifier, password }) {
    const parsed = normalizeIdentifier(identifier);
    if (!parsed.valid) throw new Error(parsed.error);
    if (!password) throw new Error("Informe sua senha.");

    if (isFirebaseMode) {
      const { signInWithEmailAndPassword } = fbMod.auth;
      await signInWithEmailAndPassword(fbAuth, parsed.authEmail, password);
      return;
    }

    const s = readLocalStore();
    const acc = s.localAccounts[parsed.authEmail];
    if (!acc || acc.password !== password) {
      throw new Error("E-mail/telefone ou senha incorretos.");
    }
    const roleRec = (s.accessRoles || []).find((r) => r.authEmail === parsed.authEmail);
    currentUser = {
      uid: acc.uid,
      fullName: roleRec?.fullName || acc.fullName,
      displayContact: acc.displayContact,
      authEmail: acc.authEmail,
      role: roleRec?.role === "admin" ? "admin" : "aluno"
    };
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(currentUser));
    syncStateFromLocalStore(s);
  }

  async function logoutAccount() {
    if (isFirebaseMode) {
      const { signOut } = fbMod.auth;
      await signOut(fbAuth);
    } else {
      currentUser = null;
      localStorage.removeItem(LOCAL_SESSION_KEY);
      if (activeTab === "admin-acessos") switchTab("dashboard");
      renderAll();
    }
    showToast("Você saiu da sua conta. Modo somente visualização ativado.");
  }

  // ==========================================================================
  // INITIALIZE BACKEND (FIREBASE REAL-TIME OR LOCAL PREVIEW)
  // ==========================================================================
  async function initBackend() {
    const cfgObj = window.TERCEIRAO_FIREBASE;
    if (cfgObj && cfgObj.isConfigured()) {
      try {
        const [appMod, authMod, fsMod] = await Promise.all([
          import("https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js"),
          import("https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js"),
          import("https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js")
        ]);
        fbMod = { app: appMod, auth: authMod, fs: fsMod };
        const app = appMod.initializeApp(cfgObj.config);
        fbAuth = authMod.getAuth(app);
        fbDb = fsMod.getFirestore(app);
        isFirebaseMode = true;

        document.getElementById("connectionLabel").textContent = "Firebase Online";
        document.getElementById("firebasePreviewBanner").style.display = "none";

        attachFirestoreListeners();
        authMod.onAuthStateChanged(fbAuth, handleFirebaseAuthChange);
        return;
      } catch (err) {
        console.error("Erro ao conectar ao Firebase:", err);
        showToast("Falha ao iniciar Firebase. Usando modo prévia local.");
      }
    }

    // Modo Prévia Local
    isFirebaseMode = false;
    document.getElementById("connectionLabel").textContent = "Prévia Local (sem Firebase)";
    document.getElementById("connectionDot").style.background = "var(--gold)";
    document.getElementById("firebasePreviewBanner").style.display = "block";

    try {
      const savedSess = localStorage.getItem(LOCAL_SESSION_KEY);
      if (savedSess) currentUser = JSON.parse(savedSess);
    } catch {
      currentUser = null;
    }
    syncStateFromLocalStore(readLocalStore());
  }

  function clearAllListeners() {
    unsubs.forEach((u) => typeof u === "function" && u());
    unsubs = [];
    Object.values(pollVoteUnsubs).forEach((u) => typeof u === "function" && u());
    pollVoteUnsubs = {};
    if (accessRolesUnsub) {
      accessRolesUnsub();
      accessRolesUnsub = null;
    }
  }

  function attachFirestoreListeners() {
    clearAllListeners();
    const { collection, doc, onSnapshot } = fbMod.fs;

    unsubs.push(
      onSnapshot(doc(fbDb, "settings", "general"), (snap) => {
        if (snap.exists()) {
          data.settings = { ...createEmptyData().settings, ...snap.data() };
          renderAll();
        }
      })
    );

    const simpleCollections = [
      "notices",
      "financeTransactions",
      "formaturaPlans",
      "shirtOrders",
      "interclasseSports",
      "interclasseGames",
      "interclasseNotes",
      "shirtModels",
      "shirtVotes",
      "trotes",
      "troteIdeas",
      "classMembers",
      "tasks",
      "meetings"
    ];

    for (const colName of simpleCollections) {
      unsubs.push(
        onSnapshot(collection(fbDb, colName), (snap) => {
          data[colName] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          renderAll();
        })
      );
    }

    // Polls + votes subcollections
    unsubs.push(
      onSnapshot(collection(fbDb, "polls"), (snap) => {
        data.polls = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const currentIds = new Set(data.polls.map((p) => p.id));

        // Cleanup removed poll vote listeners
        for (const pid of Object.keys(pollVoteUnsubs)) {
          if (!currentIds.has(pid)) {
            pollVoteUnsubs[pid]();
            delete pollVoteUnsubs[pid];
            delete data.pollVotes[pid];
          }
        }
        // Attach vote listeners for each poll
        for (const poll of data.polls) {
          if (!pollVoteUnsubs[poll.id]) {
            pollVoteUnsubs[poll.id] = onSnapshot(collection(fbDb, "polls", poll.id, "votes"), (vSnap) => {
              data.pollVotes[poll.id] = vSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
              renderPolls();
            });
          }
        }
        renderPolls();
      })
    );
  }

  let ownRoleUnsub = null;
  function handleFirebaseAuthChange(user) {
    if (ownRoleUnsub) {
      ownRoleUnsub();
      ownRoleUnsub = null;
    }
    if (accessRolesUnsub) {
      accessRolesUnsub();
      accessRolesUnsub = null;
    }

    if (!user) {
      currentUser = null;
      data.accessRoles = [];
      if (activeTab === "admin-acessos") switchTab("dashboard");
      renderAll();
      return;
    }

    const authEmail = (user.email || "").toLowerCase();
    const { doc, collection, onSnapshot } = fbMod.fs;

    currentUser = {
      uid: user.uid,
      fullName: user.displayName || authEmail.split("@")[0],
      displayContact: authEmail.endsWith("@tel.terceirao.app") ? authEmail.replace("@tel.terceirao.app", "") : authEmail,
      authEmail,
      role: "aluno"
    };
    renderAll();

    // Watch own role document in real-time
    ownRoleUnsub = onSnapshot(doc(fbDb, "accessRoles", authEmail), (snap) => {
      if (snap.exists()) {
        const rd = snap.data();
        currentUser = {
          uid: user.uid,
          fullName: rd.fullName || user.displayName || currentUser.fullName,
          displayContact: rd.displayContact || currentUser.displayContact,
          authEmail,
          role: rd.role === "admin" ? "admin" : "aluno"
        };
      } else {
        currentUser.role = "aluno";
      }

      if (currentUser.role === "admin") {
        if (!accessRolesUnsub) {
          accessRolesUnsub = onSnapshot(collection(fbDb, "accessRoles"), (listSnap) => {
            data.accessRoles = listSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
            renderAdminAccess();
          });
        }
      } else {
        if (accessRolesUnsub) {
          accessRolesUnsub();
          accessRolesUnsub = null;
        }
        data.accessRoles = [];
        if (activeTab === "admin-acessos") switchTab("dashboard");
      }

      renderAll();
    });
  }

  // ==========================================================================
  // THEME, NAVIGATION, MODAL & LIGHTBOX
  // ==========================================================================
  function applyTheme() {
    const saved = localStorage.getItem(THEME_KEY) || "dark";
    const theme = saved === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", theme);
    document.getElementById("themeIconSun").style.display = theme === "dark" ? "block" : "none";
    document.getElementById("themeIconMoon").style.display = theme === "light" ? "block" : "none";
  }

  function switchTab(tabId) {
    if (!TAB_META[tabId]) return;
    if (tabId === "admin-acessos" && !isAdmin()) {
      showToast("Área exclusiva para organizadores (Admins).");
      return;
    }
    activeTab = tabId;

    document.querySelectorAll(".nav-item").forEach((btn) => {
      const isCurrent = btn.dataset.tab === tabId;
      btn.classList.toggle("active", isCurrent);
      btn.setAttribute("aria-selected", String(isCurrent));
    });

    document.querySelectorAll(".tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === "panel-" + tabId);
    });

    const [title, subtitle] = TAB_META[tabId];
    document.getElementById("topbarTitle").textContent = title;
    document.getElementById("topbarSubtitle").textContent = subtitle;

    closeMobileSidebar();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openMobileSidebar() {
    document.getElementById("sidebar").classList.add("open");
    document.getElementById("sidebarOverlay").classList.add("open");
  }

  function closeMobileSidebar() {
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sidebarOverlay").classList.remove("open");
  }

  function openModal(title, htmlContent, onBind) {
    document.getElementById("modalTitle").textContent = title;
    const body = document.getElementById("modalBody");
    body.innerHTML = htmlContent;
    document.getElementById("modalBackdrop").classList.add("open");
    document.getElementById("modalBackdrop").setAttribute("aria-hidden", "false");
    if (typeof onBind === "function") onBind(body);
  }

  function closeModal() {
    document.getElementById("modalBackdrop").classList.remove("open");
    document.getElementById("modalBackdrop").setAttribute("aria-hidden", "true");
  }

  function openLightbox(imgSrc, title, desc) {
    document.getElementById("lightboxImg").src = imgSrc;
    document.getElementById("lightboxTitle").textContent = title;
    document.getElementById("lightboxDesc").textContent = desc || "";
    document.getElementById("lightbox").classList.add("open");
    document.getElementById("lightbox").setAttribute("aria-hidden", "false");
  }

  function closeLightbox() {
    document.getElementById("lightbox").classList.remove("open");
    document.getElementById("lightbox").setAttribute("aria-hidden", "true");
  }

  // ==========================================================================
  // FINANCE CALCULATION
  // ==========================================================================
  function computeFinanceStats() {
    let totalIn = 0;
    let totalOut = 0;
    const byCategory = {};

    for (const tx of data.financeTransactions) {
      const amt = Number(tx.amount) || 0;
      if (tx.type === "entrada") {
        totalIn += amt;
        const cat = tx.category || "Outros";
        byCategory[cat] = (byCategory[cat] || 0) + amt;
      } else {
        totalOut += amt;
      }
    }

    const balance = totalIn - totalOut;
    const goal = Number(data.settings.financeGoal) || 0;
    const pct = goal > 0 ? Math.min(100, Math.max(0, (balance / goal) * 100)) : 0;
    const remaining = goal > 0 ? Math.max(0, goal - balance) : 0;

    return { totalIn, totalOut, balance, goal, pct, remaining, byCategory };
  }

  // ==========================================================================
  // RENDER: AUTH CHROME & SIDEBAR
  // ==========================================================================
  function renderAuthChrome() {
    const role = isAdmin() ? "admin" : isLoggedIn() ? "aluno" : "visitor";
    document.body.setAttribute("data-role", role);

    const badge = document.getElementById("roleBadgeTop");
    const authBtn = document.getElementById("openAuthBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    const userBox = document.getElementById("sidebarUserBox");

    if (role === "admin") {
      badge.className = "role-badge admin";
      badge.textContent = `🛡️ Admin • ${currentUser.fullName.split(" ")[0]}`;
      authBtn.style.display = "none";
      logoutBtn.style.display = "inline-flex";
      userBox.innerHTML = `
        <span class="tag tag-gold" style="align-self:flex-start;">Organizador (Admin)</span>
        <div class="sidebar-user-name">${esc(currentUser.fullName)}</div>
        <div class="sidebar-user-contact">${esc(currentUser.displayContact)}</div>
      `;
    } else if (role === "aluno") {
      badge.className = "role-badge aluno";
      badge.textContent = `🎓 Aluno • ${currentUser.fullName.split(" ")[0]}`;
      authBtn.style.display = "none";
      logoutBtn.style.display = "inline-flex";
      userBox.innerHTML = `
        <span class="tag tag-sky" style="align-self:flex-start;">Aluno</span>
        <div class="sidebar-user-name">${esc(currentUser.fullName)}</div>
        <div class="sidebar-user-contact">${esc(currentUser.displayContact)}</div>
      `;
    } else {
      badge.className = "role-badge visitor";
      badge.textContent = "👁️ Visualização";
      authBtn.style.display = "inline-flex";
      logoutBtn.style.display = "none";
      userBox.innerHTML = `
        <div class="sidebar-user-name">Modo Visualização</div>
        <div class="sidebar-user-contact">Entre para cadastrar sua camisa ou votar.</div>
      `;
    }

    document.getElementById("classNameDisplay").textContent = data.settings.className || "3º Ano • Refferencial";
    document.getElementById("heroClassBadge").textContent = `TERCEIRÃO 2027 • ${(data.settings.className || "REFFERENCIAL").toUpperCase()}`;

    const fin = computeFinanceStats();
    document.getElementById("badgeFormatura").textContent = `${Math.round(fin.pct)}%`;
    document.getElementById("badgeCamisas").textContent = String(data.shirtOrders.length);
    document.getElementById("badgeTrotes").textContent = String(data.trotes.length);
    document.getElementById("badgeAlunos").textContent = String(data.classMembers.length);
    const openTasks = data.tasks.filter((t) => t.status !== "done").length;
    document.getElementById("badgeTarefas").textContent = String(openTasks);
  }

  // ==========================================================================
  // RENDER: VISÃO GERAL (DASHBOARD)
  // ==========================================================================
  function renderDashboard() {
    const fin = computeFinanceStats();

    const countdownItems = [
      { label: "🎓 Formatura 2027", date: data.settings.graduationDate },
      { label: "🏆 6º Jogos Refferencial", date: data.settings.interclasseDate }
    ];

    document.getElementById("countdownCluster").innerHTML = countdownItems
      .map((item) => {
        const d = daysUntil(item.date);
        const display = d === null ? "—" : d >= 0 ? d : "Passou";
        const sub = d === null ? "a definir" : d > 0 ? "dias" : d === 0 ? "é hoje!" : "";
        return `
          <div class="countdown-item">
            <div>
              <div class="countdown-label">${esc(item.label)}</div>
              <div class="countdown-date">${formatDateBR(item.date)}</div>
            </div>
            <div class="countdown-days">${esc(display)}<small>${esc(sub)}</small></div>
          </div>
        `;
      })
      .join("");

    const nextTrote = [...data.trotes]
      .filter((t) => t.status !== "realizado" && t.date)
      .sort((a, b) => a.date.localeCompare(b.date))[0];

    document.getElementById("dashboardKpis").innerHTML = `
      <div class="kpi-card">
        <div class="kpi-top"><span>Caixa da Formatura</span><span class="tag tag-emerald">${fin.pct.toFixed(0)}%</span></div>
        <div class="kpi-value">${formatBRL(fin.balance)}</div>
        <div class="kpi-sub">${fin.goal > 0 ? `Meta: ${formatBRL(fin.goal)}` : "Meta ainda não definida"}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-top"><span>Camisas Interclasse</span><span class="tag tag-orange">${data.shirtOrders.length}</span></div>
        <div class="kpi-value">${data.shirtOrders.length} pedido(s)</div>
        <div class="kpi-sub">${data.interclasseSports.length} modalidade(s) cadastradas</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-top"><span>Próximo Trote</span><span class="tag tag-violet">${nextTrote ? formatDateBR(nextTrote.date) : "—"}</span></div>
        <div class="kpi-value" style="font-size:1.1rem;">${nextTrote ? esc(nextTrote.title) : "Nenhum agendado"}</div>
        <div class="kpi-sub">${data.trotes.length} trote(s) no calendário</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-top"><span>Organização</span><span class="tag tag-sky">${data.classMembers.length} alunos</span></div>
        <div class="kpi-value">${data.polls.length} enquete(s)</div>
        <div class="kpi-sub">${data.tasks.filter((t) => t.status !== "done").length} tarefa(s) em aberto</div>
      </div>
    `;

    // Avisos
    const noticesEl = document.getElementById("noticesList");
    const sortedNotices = [...data.notices].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    if (!sortedNotices.length) {
      noticesEl.innerHTML = `<div class="empty-state">Nenhum aviso publicado ainda.${isAdmin() ? ' Clique em "+ Aviso" para publicar o primeiro.' : ""}</div>`;
    } else {
      noticesEl.innerHTML = sortedNotices
        .map((n) => {
          const prioClass = n.priority === "alta" ? "tag-danger" : n.priority === "media" ? "tag-gold" : "tag-sky";
          return `
            <div class="list-item">
              <div class="list-item-main">
                <div class="list-item-title">${esc(n.title)}</div>
                <p class="muted-sm" style="margin-bottom:6px;">${esc(n.body)}</p>
                <div class="list-item-meta">
                  <span class="tag ${prioClass}">${esc(n.priority || "media")}</span>
                  <span>Por ${esc(n.author || "Organização")}</span>
                  <span>• ${formatDateBR(n.date)}</span>
                </div>
              </div>
              <button class="btn-ghost btn-xs admin-only" data-delete-notice="${esc(n.id)}" title="Remover">✕</button>
            </div>
          `;
        })
        .join("");
    }

    // Próximos eventos (Trotes + Jogos)
    const feed = [
      ...data.trotes
        .filter((t) => t.status !== "realizado" && t.date)
        .map((t) => ({ date: t.date, label: t.title, kind: "Trote", tagClass: "tag-violet", jump: "trotes-cal" })),
      ...data.interclasseGames
        .filter((g) => g.result === "agendado" && g.date)
        .map((g) => ({
          date: g.date,
          label: `${g.sportName} vs ${g.opponent}${g.time ? ` (${g.time})` : ""}`,
          kind: "Interclasse",
          tagClass: "tag-orange",
          jump: "inter-datas"
        }))
    ]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 6);

    const feedEl = document.getElementById("upcomingFeed");
    feedEl.innerHTML = feed.length
      ? feed
          .map(
            (ev) => `
          <div class="list-item">
            <div class="list-item-main">
              <div class="list-item-title">${esc(ev.label)}</div>
              <div class="list-item-meta">
                <span class="tag ${ev.tagClass}">${esc(ev.kind)}</span>
                <span>📅 ${formatDateBR(ev.date)}</span>
              </div>
            </div>
            <button class="btn-ghost btn-xs" data-jump="${ev.jump}">Ver</button>
          </div>`
          )
          .join("")
      : `<div class="empty-state">Nenhum trote ou jogo agendado ainda.</div>`;
  }

  // ==========================================================================
  // RENDER: FORMATURA (CAIXA & PLANEJAMENTO)
  // ==========================================================================
  function renderFormatura() {
    const fin = computeFinanceStats();

    document.getElementById("financeBalanceHeadline").textContent = formatBRL(fin.balance);
    document.getElementById("financeGoalSub").textContent =
      fin.goal > 0 ? `Meta total da formatura: ${formatBRL(fin.goal)}` : "Meta ainda não definida pelos organizadores";
    document.getElementById("financePercentLabel").textContent = `${fin.pct.toFixed(1)}% da meta atingida`;
    document.getElementById("financeRemainingLabel").textContent =
      fin.goal <= 0
        ? "Defina a meta em Configurar"
        : fin.remaining > 0
        ? `Faltam ${formatBRL(fin.remaining)}`
        : "🎉 Meta 100% atingida!";
    document.getElementById("financeProgressBar").style.width = `${fin.pct}%`;

    document.getElementById("financeMiniKpis").innerHTML = `
      <div class="mini-stat">
        <span>Total de Entradas</span>
        <strong style="color:var(--emerald);">${formatBRL(fin.totalIn)}</strong>
      </div>
      <div class="mini-stat">
        <span>Total de Saídas</span>
        <strong style="color:var(--danger);">${formatBRL(fin.totalOut)}</strong>
      </div>
      <div class="mini-stat">
        <span>Mensalidade Sugerida</span>
        <strong>${data.settings.monthlyFee > 0 ? `${formatBRL(data.settings.monthlyFee)}/mês` : "A definir"}</strong>
      </div>
      <div class="mini-stat">
        <span>Movimentações</span>
        <strong>${data.financeTransactions.length}</strong>
      </div>
    `;

    // Gráfico por origem
    const entries = Object.entries(fin.byCategory).sort((a, b) => b[1] - a[1]);
    const chartEl = document.getElementById("financeChartContainer");
    if (!entries.length) {
      chartEl.innerHTML = `<div class="empty-state">Nenhuma entrada registrada ainda.</div>`;
    } else {
      const maxVal = entries[0][1] || 1;
      chartEl.innerHTML = `
        <div class="bar-chart-list">
          ${entries
            .map(([cat, val]) => {
              const widthPct = Math.max(4, Math.round((val / maxVal) * 100));
              const sharePct = fin.totalIn ? Math.round((val / fin.totalIn) * 100) : 0;
              return `
                <div>
                  <div class="bar-row-head">
                    <strong>${esc(cat)}</strong>
                    <span>${formatBRL(val)} <span class="muted-sm">(${sharePct}%)</span></span>
                  </div>
                  <div class="bar-track"><div class="bar-fill" style="width:${widthPct}%"></div></div>
                </div>
              `;
            })
            .join("")}
        </div>
      `;
    }

    updateSimulator();

    // Extrato
    const filter = document.getElementById("txTypeFilter").value;
    const txs = data.financeTransactions
      .filter((tx) => filter === "all" || tx.type === filter)
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const txEl = document.getElementById("transactionsList");
    txEl.innerHTML = txs.length
      ? txs
          .map((tx) => {
            const isIn = tx.type === "entrada";
            return `
              <div class="list-item">
                <div class="list-item-main">
                  <div class="list-item-title">${esc(tx.description)}</div>
                  <div class="list-item-meta">
                    <span class="tag ${isIn ? "tag-emerald" : "tag-danger"}">${isIn ? "Entrada" : "Saída"}</span>
                    <span>${esc(tx.category)}</span>
                    <span>• ${formatDateBR(tx.date)}</span>
                  </div>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                  <strong style="color:${isIn ? "var(--emerald)" : "var(--danger)"}; white-space:nowrap;">
                    ${isIn ? "+" : "-"} ${formatBRL(tx.amount)}
                  </strong>
                  <button class="btn-ghost btn-xs admin-only" data-delete-tx="${esc(tx.id)}" title="Excluir">✕</button>
                </div>
              </div>
            `;
          })
          .join("")
      : `<div class="empty-state">Nenhuma movimentação financeira lançada ainda.</div>`;

    // Planejamento da Festa
    const plansGrid = document.getElementById("formaturaPlansGrid");
    if (!data.formaturaPlans.length) {
      plansGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Nenhum fornecedor ou item de planejamento cadastrado ainda.${isAdmin() ? ' Clique em "+ Novo Item / Fornecedor".' : ""}</div>`;
    } else {
      plansGrid.innerHTML = data.formaturaPlans
        .map((p) => {
          const stCls = p.status === "fechado" ? "tag-emerald" : p.status === "negociando" ? "tag-gold" : "tag-sky";
          return `
            <div class="card">
              <div class="card-header" style="margin-bottom:8px;">
                <div>
                  <span class="tag ${stCls}">${esc(p.status || "pesquisando")}</span>
                  <h3 style="margin-top:6px;">${esc(p.title)}</h3>
                  <p class="muted-sm">${esc(p.category || "Formatura")}</p>
                </div>
                <div class="admin-only" style="display:flex; gap:6px;">
                  <button class="btn-ghost btn-xs" data-edit-plan="${esc(p.id)}">Editar</button>
                  <button class="btn-ghost btn-xs" data-delete-plan="${esc(p.id)}">✕</button>
                </div>
              </div>
              <p class="muted-sm" style="margin-bottom:10px;">${esc(p.notes || "Sem observações.")}</p>
              <div class="list-item-meta" style="justify-content:space-between; border-top:1px solid var(--border); padding-top:10px;">
                <span>Valor estimado: <strong>${p.estimatedCost ? formatBRL(p.estimatedCost) : "A orçar"}</strong></span>
                ${p.contact ? `<span>📞 ${esc(p.contact)}</span>` : ""}
              </div>
            </div>
          `;
        })
        .join("");
    }
  }

  function updateSimulator() {
    const fin = computeFinanceStats();
    const students = Math.max(1, Number(document.getElementById("simStudents").value) || 30);
    const months = Math.max(1, Number(document.getElementById("simMonths").value) || 12);
    const perStudentTotal = fin.remaining / students;
    const perStudentMonth = perStudentTotal / months;

    document.getElementById("simulatorResult").innerHTML = `
      <div class="sim-box-item">
        <span>Falta por aluno (total)</span>
        <strong>${formatBRL(perStudentTotal)}</strong>
      </div>
      <div class="sim-box-item">
        <span>Meta mensal por aluno</span>
        <strong>${formatBRL(perStudentMonth)}/mês</strong>
      </div>
    `;
  }

  // ==========================================================================
  // RENDER: INTERCLASSE — 1. CAMISAS (NOME & TAMANHO — PÚBLICO)
  // ==========================================================================
  function renderInterCamisas() {
    const ownCard = document.getElementById("ownShirtCard");
    const sizes = ["PP", "P", "M", "G", "GG", "XG", "Baby Look P", "Baby Look M", "Baby Look G"];

    if (!isLoggedIn()) {
      ownCard.innerHTML = `
        <div class="card-header" style="margin-bottom:0; align-items:center;">
          <div>
            <h3>👕 Quer escolher o nome e tamanho da sua camisa?</h3>
            <p class="muted-sm">Entre com sua conta de aluno (ou crie sua conta agora) para preencher e editar os dados da sua própria camisa.</p>
          </div>
          <button class="btn-primary" id="ownShirtLoginPromptBtn">Entrar / Cadastrar</button>
        </div>
      `;
    } else {
      const mine = data.shirtOrders.find((o) => o.id === currentUser.uid || o.uid === currentUser.uid);
      const sizeOpts = sizes
        .map((sz) => `<option value="${esc(sz)}" ${(mine?.shirtSize || "M") === sz ? "selected" : ""}>${esc(sz)}</option>`)
        .join("");

      ownCard.innerHTML = `
        <div class="card-header" style="margin-bottom:12px;">
          <div>
            <span class="tag tag-sky">SEU REGISTRO INDIVIDUAL</span>
            <h3 style="margin-top:6px;">${mine ? "Editar minha camisa do Interclasse" : "Cadastrar minha camisa do Interclasse"}</h3>
            <p class="muted-sm">Logado como <strong>${esc(currentUser.fullName)}</strong> — somente você (e os organizadores) pode alterar este registro.</p>
          </div>
          ${mine ? `<button class="btn-ghost btn-xs" id="deleteOwnShirtBtn">Remover meu registro</button>` : ""}
        </div>
        <form id="ownShirtForm">
          <div class="form-row-2">
            <div class="field">
              <label for="ownShirtName">Nome nas Costas da Camisa</label>
              <input type="text" id="ownShirtName" value="${esc(mine?.shirtName || "")}" placeholder="Ex: SAMUEL, SILVA, BIAA..." maxlength="24" required />
            </div>
            <div class="field">
              <label for="ownShirtSize">Tamanho da Camisa</label>
              <select id="ownShirtSize">${sizeOpts}</select>
            </div>
          </div>
          <div class="form-row-2">
            <div class="field">
              <label for="ownShirtNumber">Número (opcional)</label>
              <input type="text" id="ownShirtNumber" value="${esc(mine?.shirtNumber || "")}" placeholder="Ex: 10, 07, 27..." maxlength="4" />
            </div>
            <div class="field">
              <label for="ownShirtNotes">Observação (opcional)</label>
              <input type="text" id="ownShirtNotes" value="${esc(mine?.notes || "")}" placeholder="Ex: Manga longa, gola V..." />
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end;">
            <button type="submit" class="btn-primary">${mine ? "Atualizar minha camisa" : "Salvar minha camisa"}</button>
          </div>
        </form>
      `;
    }

    // Grade resumida
    const counts = {};
    for (const o of data.shirtOrders) {
      const sz = o.shirtSize || "M";
      counts[sz] = (counts[sz] || 0) + 1;
    }
    const total = data.shirtOrders.length;
    document.getElementById("shirtSizeSummary").innerHTML = `
      <div class="kpi-card">
        <div class="kpi-top"><span>Total de Camisas</span><span class="tag tag-orange">Pedido</span></div>
        <div class="kpi-value">${total}</div>
        <div class="kpi-sub">Alunos cadastrados na lista</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-top"><span>PP / P / Baby Look</span><span class="tag tag-sky">Grade</span></div>
        <div class="kpi-value">${(counts.PP || 0) + (counts.P || 0) + (counts["Baby Look P"] || 0) + (counts["Baby Look M"] || 0) + (counts["Baby Look G"] || 0)}</div>
        <div class="kpi-sub">PP: ${counts.PP || 0} • P: ${counts.P || 0} • BL: ${(counts["Baby Look P"] || 0) + (counts["Baby Look M"] || 0) + (counts["Baby Look G"] || 0)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-top"><span>M / G</span><span class="tag tag-gold">Grade</span></div>
        <div class="kpi-value">${(counts.M || 0) + (counts.G || 0)}</div>
        <div class="kpi-sub">M: ${counts.M || 0} • G: ${counts.G || 0}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-top"><span>GG / XG</span><span class="tag tag-emerald">Grade</span></div>
        <div class="kpi-value">${(counts.GG || 0) + (counts.XG || 0)}</div>
        <div class="kpi-sub">GG: ${counts.GG || 0} • XG: ${counts.XG || 0}</div>
      </div>
    `;

    // Tabela geral
    const q = (document.getElementById("shirtOrderSearch").value || "").trim().toLowerCase();
    const filtered = [...data.shirtOrders]
      .filter(
        (o) =>
          !q ||
          (o.studentName || "").toLowerCase().includes(q) ||
          (o.shirtName || "").toLowerCase().includes(q) ||
          (o.shirtSize || "").toLowerCase().includes(q)
      )
      .sort((a, b) => (a.studentName || "").localeCompare(b.studentName || ""));

    document.getElementById("shirtOrdersCount").textContent = `${filtered.length} de ${data.shirtOrders.length} camisa(s)`;
    const wrap = document.getElementById("shirtOrdersTableWrap");

    if (!filtered.length) {
      wrap.innerHTML = `<div class="empty-state">Nenhuma camisa cadastrada ainda.</div>`;
      return;
    }

    wrap.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Aluno</th>
            <th>Nome na Camisa</th>
            <th>Nº</th>
            <th>Tamanho</th>
            <th>Obs.</th>
            ${isAdmin() ? "<th>Admin</th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${filtered
            .map((o) => {
              const isMine = isLoggedIn() && (o.id === currentUser.uid || o.uid === currentUser.uid);
              return `
                <tr>
                  <td>
                    <strong>${esc(o.studentName)}</strong>
                    ${isMine ? `<span class="tag tag-sky" style="margin-left:6px;">Você</span>` : ""}
                  </td>
                  <td><strong>${esc(o.shirtName)}</strong></td>
                  <td>${esc(o.shirtNumber || "—")}</td>
                  <td><span class="tag tag-orange">${esc(o.shirtSize)}</span></td>
                  <td class="muted-sm">${esc(o.notes || "—")}</td>
                  ${
                    isAdmin()
                      ? `<td>
                          <div style="display:flex; gap:6px;">
                            <button class="btn-ghost btn-xs" data-admin-edit-shirtorder="${esc(o.id)}">Editar</button>
                            <button class="btn-ghost btn-xs" data-admin-delete-shirtorder="${esc(o.id)}">✕</button>
                          </div>
                        </td>`
                      : ""
                  }
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;
  }

  // ==========================================================================
  // RENDER: INTERCLASSE — 2. DATAS DOS JOGOS POR MODALIDADE
  // ==========================================================================
  function renderInterDatas() {
    const filterSel = document.getElementById("gamesModalityFilter");
    const currentFilter = filterSel.value || "all";

    const modalityNames = Array.from(
      new Set([
        ...data.interclasseSports.map((s) => s.name),
        ...data.interclasseGames.map((g) => g.sportName)
      ].filter(Boolean))
    ).sort();

    filterSel.innerHTML =
      `<option value="all">Todas as modalidades</option>` +
      modalityNames.map((m) => `<option value="${esc(m)}" ${currentFilter === m ? "selected" : ""}>${esc(m)}</option>`).join("");

    const filteredGames = data.interclasseGames
      .filter((g) => currentFilter === "all" || g.sportName === currentFilter)
      .sort((a, b) => `${a.date || ""} ${a.time || ""}`.localeCompare(`${b.date || ""} ${b.time || ""}`));

    const container = document.getElementById("gamesByModalityContainer");
    if (!filteredGames.length) {
      container.innerHTML = `<div class="empty-state">Nenhuma data de jogo cadastrada ainda.${isAdmin() ? ' Clique em "+ Agendar Jogo" para adicionar por modalidade.' : ""}</div>`;
      return;
    }

    // Agrupar por modalidade
    const grouped = {};
    for (const g of filteredGames) {
      const key = g.sportName || "Outros";
      grouped[key] = grouped[key] || [];
      grouped[key].push(g);
    }

    const badgeMap = {
      agendado: ["Agendado", "tag-sky"],
      vitoria: ["Vitória 🏆", "tag-emerald"],
      empate: ["Empate", "tag-gold"],
      derrota: ["Derrota", "tag-danger"]
    };

    container.innerHTML = Object.entries(grouped)
      .map(([sportName, games]) => {
        const sportInfo = data.interclasseSports.find((s) => s.name === sportName);
        return `
          <div class="modality-group-card">
            <div class="modality-group-header">
              <div>
                <h3>${esc(sportInfo?.icon || "🏅")} ${esc(sportName)}</h3>
                <p class="muted-sm">${games.length} jogo(s) agendado(s)</p>
              </div>
              <span class="tag tag-orange">${esc(sportInfo?.category || "Interclasse")}</span>
            </div>
            <div class="stack-list">
              ${games
                .map((g) => {
                  const [label, cls] = badgeMap[g.result] || ["Agendado", "tag-neutral"];
                  return `
                    <div class="list-item">
                      <div class="list-item-main">
                        <div class="list-item-title">Terceirão vs ${esc(g.opponent)}</div>
                        <div class="list-item-meta">
                          <span class="tag ${cls}">${label}</span>
                          <span>📅 <strong>${formatDateBR(g.date)}</strong>${g.time ? ` às ${esc(g.time)}` : ""}</span>
                          ${g.location ? `<span>📍 ${esc(g.location)}</span>` : ""}
                          <span>Placar: <strong>${esc(g.score || "A jogar")}</strong></span>
                        </div>
                        ${g.notes ? `<p class="muted-sm" style="margin-top:4px;">${esc(g.notes)}</p>` : ""}
                      </div>
                      <div class="admin-only" style="display:flex; gap:6px;">
                        <button class="btn-secondary btn-xs" data-edit-game="${esc(g.id)}">Editar</button>
                        <button class="btn-ghost btn-xs" data-delete-game="${esc(g.id)}">✕</button>
                      </div>
                    </div>
                  `;
                })
                .join("")}
            </div>
          </div>
        `;
      })
      .join("");
  }

  // ==========================================================================
  // RENDER: INTERCLASSE — 3. TIMES & JOGADORES
  // ==========================================================================
  function renderInterTimes() {
    const sportsGrid = document.getElementById("sportsGrid");
    if (!data.interclasseSports.length) {
      sportsGrid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Nenhum time ou modalidade cadastrado ainda.${isAdmin() ? ' Clique em "+ Nova Modalidade / Time" para montar as equipes.' : ""}</div>`;
      return;
    }

    sportsGrid.innerHTML = [...data.interclasseSports]
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .map((sp) => {
        const players = Array.isArray(sp.players) ? sp.players : [];
        return `
          <div class="card sport-card">
            <div class="card-header" style="margin-bottom:4px;">
              <div>
                <h3>${esc(sp.icon || "🏅")} ${esc(sp.name)}</h3>
                <p class="muted-sm">${esc(sp.category || "Modalidade")} • Capitão: <strong>${esc(sp.captain || "A definir")}</strong></p>
              </div>
              <div class="admin-only" style="display:flex; gap:6px;">
                <button class="btn-ghost btn-xs" data-edit-sport="${esc(sp.id)}">Editar</button>
                <button class="btn-ghost btn-xs" data-delete-sport="${esc(sp.id)}">✕</button>
              </div>
            </div>
            <div>
              <div class="muted-sm" style="margin-bottom:6px; font-weight:600;">Jogadores escalados (${players.length}):</div>
              <div class="sport-players">
                ${players
                  .map(
                    (p, idx) => `
                  <span class="player-chip">
                    ${esc(p)}
                    <button class="admin-only" data-remove-player="${esc(sp.id)}" data-player-idx="${idx}" aria-label="Remover jogador">×</button>
                  </span>`
                  )
                  .join("")}
                ${!players.length ? `<span class="muted-sm">Nenhum jogador escalado ainda.</span>` : ""}
              </div>
            </div>
            <form class="inline-form admin-only" style="margin-bottom:0;" data-add-player-form="${esc(sp.id)}">
              <input type="text" placeholder="Adicionar jogador neste time..." required />
              <button type="submit" class="btn-secondary btn-sm">+ Add</button>
            </form>
            ${
              sp.notes
                ? `<div class="list-item" style="padding:10px 12px;"><div class="muted-sm"><strong>Obs.:</strong> ${esc(sp.notes)}</div></div>`
                : ""
            }
          </div>
        `;
      })
      .join("");
  }

  // ==========================================================================
  // RENDER: INTERCLASSE — 4. MODELOS DE CAMISETA & ANOTAÇÕES
  // ==========================================================================
  function renderInterModelos() {
    const hint = document.getElementById("shirtVoteHint");
    hint.textContent = isLoggedIn()
      ? "Clique na imagem para ampliar em tela cheia. Cada conta tem direito a 1 voto (você pode trocar sua escolha quando quiser)."
      : "Clique na imagem para ampliar. Faça login como aluno ou organizador para votar no seu modelo favorito.";

    const models = [...data.shirtModels].sort((a, b) => (a.order || 99) - (b.order || 99));
    const grid = document.getElementById("shirtsGrid");

    if (!models.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Nenhum modelo de camiseta adicionado à votação ainda.${isAdmin() ? ' Clique em "Carregar os 6 Modelos da Pasta" ou "+ Adicionar Modelo".' : ""}</div>`;
    } else {
      // Count votes per model from shirtVotes
      const voteCounts = {};
      for (const v of data.shirtVotes) {
        voteCounts[v.modelId] = (voteCounts[v.modelId] || 0) + 1;
      }
      const totalVotes = data.shirtVotes.length;
      const myVote = isLoggedIn() ? data.shirtVotes.find((v) => v.uid === currentUser.uid)?.modelId : null;
      const rankedIds = [...models].sort((a, b) => (voteCounts[b.id] || 0) - (voteCounts[a.id] || 0)).map((m) => m.id);

      grid.innerHTML = models
        .map((sh) => {
          const votes = voteCounts[sh.id] || 0;
          const rank = rankedIds.indexOf(sh.id) + 1;
          const pct = totalVotes ? Math.round((votes / totalVotes) * 100) : 0;
          const isLeader = rank === 1 && votes > 0;
          const votedByMe = myVote === sh.id;
          return `
            <article class="shirt-card ${isLeader ? "leader" : ""} ${votedByMe ? "voted-by-me" : ""}">
              <div class="shirt-img-wrap" data-zoom-shirt="${esc(sh.id)}">
                <img src="${esc(sh.image)}" alt="${esc(sh.name)}" loading="lazy" />
                <span class="shirt-rank-badge">${isLeader ? "👑 1º Lugar" : `#${rank}`}</span>
                <span class="shirt-zoom-hint">🔍 Ampliar</span>
              </div>
              <div class="shirt-body">
                <div style="display:flex; justify-content:space-between; gap:8px; align-items:flex-start;">
                  <div>
                    <h4>${esc(sh.name)}</h4>
                    <div class="shirt-palette">${esc(sh.palette || "")}</div>
                  </div>
                  <button class="btn-ghost btn-xs admin-only" data-delete-shirtmodel="${esc(sh.id)}" title="Remover modelo">✕</button>
                </div>
                <div class="progress-track">
                  <div class="progress-fill" style="width:${pct}%"></div>
                </div>
                <div class="shirt-vote-row">
                  <div>
                    <span class="shirt-votes-count">${votes}</span>
                    <span class="muted-sm"> voto(s) (${pct}%)</span>
                  </div>
                  ${
                    isLoggedIn()
                      ? `<button class="${votedByMe ? "btn-secondary" : "btn-primary"} btn-xs" data-vote-shirt="${esc(sh.id)}">${votedByMe ? "✓ Seu voto" : "👍 Votar"}</button>`
                      : `<button class="btn-ghost btn-xs" data-open-auth="1">Entrar p/ votar</button>`
                  }
                </div>
              </div>
            </article>
          `;
        })
        .join("");
    }

    // Notas e Checklist
    const notes = data.interclasseNotes.filter((n) => n.kind !== "check");
    const checks = data.interclasseNotes.filter((n) => n.kind === "check");

    const notesEl = document.getElementById("interNotesList");
    notesEl.innerHTML = notes.length
      ? notes
          .map(
            (n) => `
          <div class="list-item">
            <div class="list-item-main">
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                <span class="tag tag-orange">${esc(n.tag || "Geral")}</span>
                <span class="list-item-title" style="margin:0;">${esc(n.title)}</span>
              </div>
              <p class="muted-sm">${esc(n.content)}</p>
            </div>
            <button class="btn-ghost btn-xs admin-only" data-delete-internote="${esc(n.id)}">✕</button>
          </div>`
          )
          .join("")
      : `<div class="empty-state">Nenhuma anotação publicada ainda.</div>`;

    const checkEl = document.getElementById("interChecklist");
    checkEl.innerHTML = checks.length
      ? checks
          .map(
            (c) => `
          <div class="check-row ${c.done ? "checked" : ""}">
            <input type="checkbox" ${c.done ? "checked" : ""} ${isAdmin() ? "" : "disabled"} data-toggle-check="${esc(c.id)}" />
            <span>${esc(c.title)}</span>
            <button class="btn-ghost btn-xs admin-only" data-delete-internote="${esc(c.id)}">✕</button>
          </div>`
          )
          .join("")
      : `<div class="empty-state">Checklist vazio.</div>`;
  }

  // ==========================================================================
  // RENDER: TROTES (CALENDÁRIO + IDEIAS & REGRAS)
  // ==========================================================================
  function renderTrotes() {
    const monthNames = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    document.getElementById("calendarMonthLabel").textContent = `${monthNames[calendarMonth]} ${calendarYear}`;

    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();

    const trotesByDate = {};
    for (const t of data.trotes) {
      if (t.date) trotesByDate[t.date] = t;
    }

    let calHtml = "";
    for (let i = 0; i < firstDay; i++) calHtml += `<div class="cal-day empty"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(calendarMonth + 1).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      const iso = `${calendarYear}-${mm}-${dd}`;
      const ev = trotesByDate[iso];
      if (ev) {
        calHtml += `
          <button class="cal-day has-event status-${esc(ev.status)}" data-cal-date="${iso}" data-trote-id="${esc(ev.id)}" title="${esc(ev.title)}">
            <span>${d}</span>
            <span class="cal-day-dot"></span>
          </button>`;
      } else {
        calHtml += `
          <button class="cal-day" data-cal-date="${iso}" title="${isAdmin() ? `Clique para agendar trote em ${dd}/${mm}/${calendarYear}` : `${dd}/${mm}/${calendarYear}`}">
            <span>${d}</span>
          </button>`;
      }
    }
    document.getElementById("calendarGrid").innerHTML = calHtml;

    const filter = document.getElementById("troteStatusFilter").value;
    const filtered = data.trotes
      .filter((t) => filter === "all" || t.status === filter)
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    document.getElementById("trotesFilterInfo").textContent = `${filtered.length} trote(s) no calendário`;

    const listEl = document.getElementById("trotesList");
    if (!filtered.length) {
      listEl.innerHTML = `<div class="empty-state">Nenhum trote agendado ainda.${isAdmin() ? ' Clique em "+ Novo Trote" ou em um dia do calendário.' : ""}</div>`;
    } else {
      listEl.innerHTML = filtered
        .map((t) => {
          const statusCls =
            t.status === "confirmado" ? "tag-emerald" : t.status === "realizado" ? "tag-violet" : "tag-orange";
          return `
            <div class="list-item">
              <div class="list-item-main">
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
                  <span class="tag ${statusCls}">${esc(t.status)}</span>
                  <span class="tag tag-neutral">📅 ${formatDateBR(t.date)}</span>
                  ${t.theme ? `<span class="tag tag-gold">${esc(t.theme)}</span>` : ""}
                </div>
                <div class="list-item-title">${esc(t.title)}</div>
                <p class="muted-sm">${esc(t.description)}</p>
                ${t.tips ? `<p class="muted-sm" style="margin-top:4px; color:var(--sky);">💡 ${esc(t.tips)}</p>` : ""}
                <div class="task-actions" style="margin-top:10px;">
                  <button class="btn-ghost btn-xs" data-copy-trote="${esc(t.id)}">Copiar convite</button>
                  <button class="btn-secondary btn-xs admin-only" data-cycle-trote="${esc(t.id)}">Mudar Status</button>
                  <button class="btn-ghost btn-xs admin-only" data-edit-trote="${esc(t.id)}">Editar</button>
                  <button class="btn-ghost btn-xs admin-only" data-delete-trote="${esc(t.id)}">Excluir</button>
                </div>
              </div>
            </div>
          `;
        })
        .join("");
    }

    // Ideias & Regras dos Trotes
    const ideas = data.troteIdeas.filter((x) => x.kind !== "rule");
    const rules = data.troteIdeas.filter((x) => x.kind === "rule");

    document.getElementById("troteIdeasList").innerHTML = ideas.length
      ? ideas
          .map(
            (i) => `
          <div class="list-item">
            <div class="list-item-main">
              <div class="list-item-title">💡 ${esc(i.title)}</div>
              <p class="muted-sm">${esc(i.details || "")}</p>
            </div>
            <button class="btn-ghost btn-xs admin-only" data-delete-troteidea="${esc(i.id)}">✕</button>
          </div>`
          )
          .join("")
      : `<div class="empty-state">Nenhuma ideia de tema cadastrada ainda.</div>`;

    document.getElementById("troteRulesList").innerHTML = rules.length
      ? rules
          .map(
            (r) => `
          <div class="list-item">
            <div class="list-item-main">
              <div class="list-item-title">📜 ${esc(r.title)}</div>
              <p class="muted-sm">${esc(r.details || "")}</p>
            </div>
            <button class="btn-ghost btn-xs admin-only" data-delete-troteidea="${esc(r.id)}">✕</button>
          </div>`
          )
          .join("")
      : `<div class="empty-state">Nenhuma regra ou combinado publicado ainda.</div>`;
  }

  // ==========================================================================
  // RENDER: ORGANIZAÇÃO — ENQUETES, ALUNOS & FUNÇÕES, TAREFAS
  // ==========================================================================
  function renderPolls() {
    const grid = document.getElementById("pollsGrid");
    if (!data.polls.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">Nenhuma enquete criada ainda.${isAdmin() ? ' Clique em "+ Criar Enquete".' : ""}</div>`;
      return;
    }

    grid.innerHTML = data.polls
      .map((poll) => {
        const votesArr = data.pollVotes[poll.id] || [];
        const total = votesArr.length;
        const myChoice = isLoggedIn() ? votesArr.find((v) => v.uid === currentUser.uid)?.optionId : null;
        const counts = {};
        for (const v of votesArr) counts[v.optionId] = (counts[v.optionId] || 0) + 1;

        return `
          <div class="card">
            <div class="card-header">
              <div>
                <span class="tag tag-violet">${esc(poll.category || "Sala")}</span>
                <h3 style="margin-top:6px;">${esc(poll.question)}</h3>
                <p class="muted-sm">${total} voto(s) • ${isLoggedIn() ? "Clique em uma opção para votar" : "Entre na sua conta para votar"}</p>
              </div>
              <div style="display:flex; gap:6px;">
                <button class="btn-ghost btn-xs" data-copy-poll="${esc(poll.id)}">Copiar</button>
                <button class="btn-ghost btn-xs admin-only" data-delete-poll="${esc(poll.id)}">✕</button>
              </div>
            </div>
            <div class="stack-list">
              ${(poll.options || [])
                .map((opt) => {
                  const vCount = counts[opt.id] || 0;
                  const pct = total ? Math.round((vCount / total) * 100) : 0;
                  const isMine = myChoice === opt.id;
                  return `
                    <div class="poll-option ${isMine ? "voted" : ""} ${!isLoggedIn() ? "readonly" : ""}" data-vote-poll="${esc(poll.id)}" data-vote-opt="${esc(opt.id)}">
                      <div class="poll-option-head">
                        <span>${isMine ? "✓ " : ""}${esc(opt.label)}</span>
                        <span>${vCount} (${pct}%)</span>
                      </div>
                      <div class="progress-track">
                        <div class="progress-fill" style="width:${pct}%"></div>
                      </div>
                    </div>
                  `;
                })
                .join("")}
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderOrgAlunos() {
    const q = (document.getElementById("memberSearchInput").value || "").trim().toLowerCase();
    const list = [...data.classMembers]
      .filter(
        (m) =>
          !q ||
          (m.fullName || "").toLowerCase().includes(q) ||
          (m.roleInClass || "").toLowerCase().includes(q)
      )
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));

    document.getElementById("membersCountLabel").textContent = `${list.length} de ${data.classMembers.length} aluno(s)`;
    const wrap = document.getElementById("membersTableWrap");

    if (!list.length) {
      wrap.innerHTML = `<div class="empty-state">Nenhum aluno cadastrado na lista da sala ainda.${isAdmin() ? ' Clique em "+ Adicionar Aluno".' : ""}</div>`;
      return;
    }

    wrap.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Nome Completo</th>
            <th>Função na Sala</th>
            <th>Contato</th>
            <th>Observações</th>
            ${isAdmin() ? "<th>Admin</th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${list
            .map(
              (m) => `
            <tr>
              <td><strong>${esc(m.fullName)}</strong></td>
              <td><span class="tag ${m.roleInClass && m.roleInClass.toLowerCase() !== "aluno" ? "tag-orange" : "tag-neutral"}">${esc(m.roleInClass || "Aluno")}</span></td>
              <td class="muted-sm">${esc(m.contact || "—")}</td>
              <td class="muted-sm">${esc(m.notes || "—")}</td>
              ${
                isAdmin()
                  ? `<td>
                      <div style="display:flex; gap:6px;">
                        <button class="btn-ghost btn-xs" data-edit-member="${esc(m.id)}">Editar</button>
                        <button class="btn-ghost btn-xs" data-delete-member="${esc(m.id)}">✕</button>
                      </div>
                    </td>`
                  : ""
              }
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  function renderOrgTarefas() {
    const cols = { todo: [], doing: [], done: [] };
    for (const t of data.tasks) (cols[t.status] || cols.todo).push(t);

    document.getElementById("countTodo").textContent = String(cols.todo.length);
    document.getElementById("countDoing").textContent = String(cols.doing.length);
    document.getElementById("countDone").textContent = String(cols.done.length);

    const renderCard = (t) => `
      <div class="task-card">
        <div style="display:flex; justify-content:space-between; gap:8px; align-items:center;">
          <span class="tag tag-orange">${esc(t.area || "Geral")}</span>
          <button class="btn-ghost btn-xs admin-only" data-delete-task="${esc(t.id)}" title="Excluir">✕</button>
        </div>
        <div class="list-item-title" style="margin:0;">${esc(t.title)}</div>
        <div class="list-item-meta">
          <span>👤 ${esc(t.owner || "Comissão")}</span>
          ${t.due ? `<span>• 📅 ${formatDateBR(t.due)}</span>` : ""}
        </div>
        <div class="task-actions admin-only">
          ${t.status !== "todo" ? `<button class="btn-ghost btn-xs" data-move-task="${esc(t.id)}" data-target-status="todo">← A Fazer</button>` : ""}
          ${t.status !== "doing" ? `<button class="btn-secondary btn-xs" data-move-task="${esc(t.id)}" data-target-status="doing">Em Andamento</button>` : ""}
          ${t.status !== "done" ? `<button class="btn-primary btn-xs" data-move-task="${esc(t.id)}" data-target-status="done">Concluir ✓</button>` : ""}
        </div>
      </div>
    `;

    document.getElementById("kanbanTodo").innerHTML = cols.todo.length ? cols.todo.map(renderCard).join("") : `<div class="empty-state">Sem tarefas</div>`;
    document.getElementById("kanbanDoing").innerHTML = cols.doing.length ? cols.doing.map(renderCard).join("") : `<div class="empty-state">Nada em andamento</div>`;
    document.getElementById("kanbanDone").innerHTML = cols.done.length ? cols.done.map(renderCard).join("") : `<div class="empty-state">Nenhuma concluída</div>`;

    const meetingsEl = document.getElementById("meetingsList");
    meetingsEl.innerHTML = data.meetings.length
      ? [...data.meetings]
          .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
          .map(
            (mt) => `
          <div class="list-item">
            <div class="list-item-main">
              <div class="list-item-meta" style="margin-bottom:4px;"><span class="tag tag-sky">📅 ${formatDateBR(mt.date)}</span></div>
              <div class="list-item-title">${esc(mt.title)}</div>
              <p class="muted-sm">${esc(mt.summary)}</p>
            </div>
            <div style="display:flex; gap:6px;">
              <button class="btn-ghost btn-xs" data-copy-meeting="${esc(mt.id)}">Copiar</button>
              <button class="btn-ghost btn-xs admin-only" data-delete-meeting="${esc(mt.id)}">✕</button>
            </div>
          </div>`
          )
          .join("")
      : `<div class="empty-state">Nenhuma ata registrada ainda.</div>`;
  }

  // ==========================================================================
  // RENDER: ADMINISTRAÇÃO — GERENCIAR ACESSOS
  // ==========================================================================
  function renderAdminAccess() {
    if (!isAdmin()) return;

    const admins = data.accessRoles.filter((r) => r.role === "admin");
    const alunos = data.accessRoles.filter((r) => r.role !== "admin");

    document.getElementById("adminAccessKpis").innerHTML = `
      <div class="kpi-card">
        <div class="kpi-top"><span>Organizadores (Admins)</span><span class="tag tag-gold">Total</span></div>
        <div class="kpi-value">${admins.length}</div>
        <div class="kpi-sub">Podem editar todas as abas</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-top"><span>Alunos Cadastrados</span><span class="tag tag-sky">Total</span></div>
        <div class="kpi-value">${alunos.length}</div>
        <div class="kpi-sub">Editam só a própria camisa + votam</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-top"><span>Total de Contas</span><span class="tag tag-emerald">Ativas</span></div>
        <div class="kpi-value">${data.accessRoles.length}</div>
        <div class="kpi-sub">E-mails e telefones registrados</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-top"><span>Banco de Dados</span><span class="tag ${isFirebaseMode ? "tag-emerald" : "tag-gold"}">${isFirebaseMode ? "Firebase" : "Local"}</span></div>
        <div class="kpi-value" style="font-size:1.1rem;">${isFirebaseMode ? "Online Real-Time" : "Prévia Local"}</div>
        <div class="kpi-sub">${isFirebaseMode ? "Sincronizado na nuvem" : "Configure firebase-config.js"}</div>
      </div>
    `;

    const roleFilter = document.getElementById("accessRoleFilter").value;
    const q = (document.getElementById("accessSearchInput").value || "").trim().toLowerCase();

    const filtered = [...data.accessRoles]
      .filter((r) => roleFilter === "all" || r.role === roleFilter)
      .filter(
        (r) =>
          !q ||
          (r.fullName || "").toLowerCase().includes(q) ||
          (r.displayContact || "").toLowerCase().includes(q) ||
          (r.authEmail || "").toLowerCase().includes(q)
      )
      .sort((a, b) => (a.role === "admin" ? -1 : 1) - (b.role === "admin" ? -1 : 1) || (a.fullName || "").localeCompare(b.fullName || ""));

    const wrap = document.getElementById("accessRolesTableWrap");
    if (!filtered.length) {
      wrap.innerHTML = `<div class="empty-state">Nenhum acesso encontrado para este filtro.</div>`;
      return;
    }

    wrap.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>E-mail / Telefone</th>
            <th>Status da Conta</th>
            <th>Permissão</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${filtered
            .map((r) => {
              const isSelf = currentUser && currentUser.authEmail === r.authEmail;
              const isAdm = r.role === "admin";
              return `
                <tr>
                  <td>
                    <strong>${esc(r.fullName || "Pré-cadastrado")}</strong>
                    ${isSelf ? `<span class="tag tag-sky" style="margin-left:6px;">Você</span>` : ""}
                  </td>
                  <td>${esc(r.displayContact || r.authEmail)}</td>
                  <td class="muted-sm">${r.uid ? "Conta criada ✓" : "Aguardando cadastro"}</td>
                  <td><span class="tag ${isAdm ? "tag-gold" : "tag-sky"}">${isAdm ? "Admin (Organizador)" : "Aluno"}</span></td>
                  <td>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                      ${
                        !isSelf
                          ? `<button class="btn-secondary btn-xs" data-toggle-accessrole="${esc(r.authEmail)}" data-next-role="${isAdm ? "aluno" : "admin"}">
                              ${isAdm ? "Rebaixar p/ Aluno" : "Tornar Admin"}
                            </button>
                            <button class="btn-ghost btn-xs" data-delete-accessrole="${esc(r.authEmail)}" title="Remover">✕</button>`
                          : `<span class="muted-sm">Admin atual</span>`
                      }
                    </div>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;
  }

  function renderAll() {
    applyTheme();
    renderAuthChrome();
    renderDashboard();
    renderFormatura();
    renderInterCamisas();
    renderInterDatas();
    renderInterTimes();
    renderInterModelos();
    renderTrotes();
    renderPolls();
    renderOrgAlunos();
    renderOrgTarefas();
    renderAdminAccess();
  }

  // ==========================================================================
  // MODALS (AUTH + ADMIN FORMS)
  // ==========================================================================
  function openAuthModal(initialMode = "login") {
    let mode = initialMode;

    openModal(
      "🔐 Acesso ao Portal do Terceirão",
      `
      <div class="auth-tabs">
        <button type="button" class="auth-tab-btn ${mode === "login" ? "active" : ""}" id="tabAuthLogin">Entrar</button>
        <button type="button" class="auth-tab-btn ${mode === "register" ? "active" : ""}" id="tabAuthRegister">Criar Conta</button>
      </div>
      <div class="helper-note" id="authHelperNote"></div>
      <form id="authForm">
        <div class="field" id="authNameField" style="display:none;">
          <label for="authFullName">Nome Completo</label>
          <input type="text" id="authFullName" placeholder="Ex: Maria Clara Oliveira" />
        </div>
        <div class="field">
          <label for="authIdentifier">E-mail ou Telefone (com DDD)</label>
          <input type="text" id="authIdentifier" placeholder="seuemail@gmail.com ou (11) 99999-9999" required />
        </div>
        <div class="field">
          <label for="authPassword">Senha</label>
          <input type="password" id="authPassword" placeholder="Mínimo 6 caracteres" minlength="6" required />
        </div>
        <div id="authErrorMsg" style="color:var(--danger); font-size:0.82rem; margin-bottom:10px; display:none;"></div>
        <div class="modal-footer">
          <button type="button" class="btn-ghost" id="cancelModalBtn">Cancelar</button>
          <button type="submit" class="btn-primary" id="authSubmitBtn">Entrar</button>
        </div>
      </form>
      `,
      (body) => {
        const loginTab = body.querySelector("#tabAuthLogin");
        const regTab = body.querySelector("#tabAuthRegister");
        const nameField = body.querySelector("#authNameField");
        const nameInput = body.querySelector("#authFullName");
        const submitBtn = body.querySelector("#authSubmitBtn");
        const helper = body.querySelector("#authHelperNote");
        const errBox = body.querySelector("#authErrorMsg");

        function updateMode(newMode) {
          mode = newMode;
          loginTab.classList.toggle("active", mode === "login");
          regTab.classList.toggle("active", mode === "register");
          nameField.style.display = mode === "register" ? "flex" : "none";
          nameInput.required = mode === "register";
          submitBtn.textContent = mode === "register" ? "Criar Conta" : "Entrar";
          errBox.style.display = "none";
          helper.innerHTML =
            mode === "register"
              ? "Crie sua conta com <strong>nome completo</strong>, <strong>e-mail ou telefone</strong> e <strong>senha</strong>. O 1º cadastro do portal vira Admin automaticamente; os demais entram como Alunos (ou Admin se pré-autorizados)."
              : "Entre com o <strong>e-mail ou telefone</strong> e a <strong>senha</strong> que você cadastrou.";
        }

        loginTab.onclick = () => updateMode("login");
        regTab.onclick = () => updateMode("register");
        body.querySelector("#cancelModalBtn").onclick = closeModal;
        updateMode(mode);

        body.querySelector("#authForm").onsubmit = async (e) => {
          e.preventDefault();
          errBox.style.display = "none";
          submitBtn.disabled = true;
          try {
            const identifier = body.querySelector("#authIdentifier").value;
            const password = body.querySelector("#authPassword").value;
            if (mode === "register") {
              const fullName = nameInput.value;
              const role = await registerAccount({ fullName, identifier, password });
              closeModal();
              showToast(role === "admin" ? "Conta criada como Admin (Organizador)!" : "Conta de Aluno criada com sucesso!");
            } else {
              await loginAccount({ identifier, password });
              closeModal();
              showToast("Login realizado com sucesso!");
            }
          } catch (err) {
            errBox.textContent = mapAuthError(err);
            errBox.style.display = "block";
          } finally {
            submitBtn.disabled = false;
          }
        };
      }
    );
  }

  function openSettingsModal() {
    if (!isAdmin()) return;
    const s = data.settings;
    openModal(
      "⚙️ Configurações do Portal",
      `
      <form id="settingsForm">
        <div class="field">
          <label>Nome da Turma / Escola</label>
          <input type="text" id="setClassName" value="${esc(s.className)}" required />
        </div>
        <div class="form-row-2">
          <div class="field">
            <label>Data da Formatura</label>
            <input type="date" id="setGradDate" value="${esc(s.graduationDate)}" />
          </div>
          <div class="field">
            <label>Data do Interclasse</label>
            <input type="date" id="setInterDate" value="${esc(s.interclasseDate)}" />
          </div>
        </div>
        <div class="form-row-2">
          <div class="field">
            <label>Meta Total da Formatura (R$)</label>
            <input type="number" id="setGoal" min="0" step="50" value="${esc(s.financeGoal || 0)}" />
          </div>
          <div class="field">
            <label>Mensalidade Sugerida (R$)</label>
            <input type="number" id="setMonthlyFee" min="0" step="1" value="${esc(s.monthlyFee || 0)}" />
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-ghost" id="cancelModalBtn">Cancelar</button>
          <button type="submit" class="btn-primary">Salvar Configurações</button>
        </div>
      </form>
      `,
      (body) => {
        body.querySelector("#cancelModalBtn").onclick = closeModal;
        body.querySelector("#settingsForm").onsubmit = async (e) => {
          e.preventDefault();
          await dbApi.saveSettings({
            className: body.querySelector("#setClassName").value.trim(),
            graduationDate: body.querySelector("#setGradDate").value,
            interclasseDate: body.querySelector("#setInterDate").value,
            financeGoal: Number(body.querySelector("#setGoal").value) || 0,
            monthlyFee: Number(body.querySelector("#setMonthlyFee").value) || 0
          });
          closeModal();
          showToast("Configurações salvas!");
        };
      }
    );
  }

  function openAddNoticeModal() {
    if (!isAdmin()) return;
    openModal(
      "📢 Novo Aviso no Mural",
      `
      <form id="noticeForm">
        <div class="field">
          <label>Título</label>
          <input type="text" id="ntTitle" required />
        </div>
        <div class="field">
          <label>Mensagem</label>
          <textarea id="ntBody" rows="3" required></textarea>
        </div>
        <div class="form-row-2">
          <div class="field">
            <label>Autor</label>
            <input type="text" id="ntAuthor" value="${esc(currentUser?.fullName || "Organização")}" required />
          </div>
          <div class="field">
            <label>Prioridade</label>
            <select id="ntPrio">
              <option value="alta">Alta</option>
              <option value="media" selected>Média</option>
              <option value="baixa">Baixa</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-ghost" id="cancelModalBtn">Cancelar</button>
          <button type="submit" class="btn-primary">Publicar</button>
        </div>
      </form>
      `,
      (body) => {
        body.querySelector("#cancelModalBtn").onclick = closeModal;
        body.querySelector("#noticeForm").onsubmit = async (e) => {
          e.preventDefault();
          await dbApi.addDoc("notices", {
            title: body.querySelector("#ntTitle").value.trim(),
            body: body.querySelector("#ntBody").value.trim(),
            author: body.querySelector("#ntAuthor").value.trim(),
            priority: body.querySelector("#ntPrio").value,
            date: new Date().toISOString().slice(0, 10)
          });
          closeModal();
          showToast("Aviso publicado!");
        };
      }
    );
  }

  function openTransactionModal() {
    if (!isAdmin()) return;
    openModal(
      "💰 Nova Movimentação da Formatura",
      `
      <form id="txForm">
        <div class="form-row-2">
          <div class="field">
            <label>Tipo</label>
            <select id="txType">
              <option value="entrada">Entrada (+)</option>
              <option value="saida">Saída (-)</option>
            </select>
          </div>
          <div class="field">
            <label>Valor (R$)</label>
            <input type="number" id="txAmount" min="0.01" step="0.01" required />
          </div>
        </div>
        <div class="form-row-2">
          <div class="field">
            <label>Categoria</label>
            <input type="text" id="txCat" list="txCatList" placeholder="Mensalidade, Rifa, Buffet..." required />
            <datalist id="txCatList">
              <option value="Mensalidade"></option>
              <option value="Rifa"></option>
              <option value="Vendas na Escola"></option>
              <option value="Evento / Festa"></option>
              <option value="Buffet / Espaço"></option>
              <option value="Decoração / DJ / Foto"></option>
            </datalist>
          </div>
          <div class="field">
            <label>Data</label>
            <input type="date" id="txDate" value="${new Date().toISOString().slice(0, 10)}" required />
          </div>
        </div>
        <div class="field">
          <label>Descrição</label>
          <input type="text" id="txDesc" required />
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-ghost" id="cancelModalBtn">Cancelar</button>
          <button type="submit" class="btn-primary">Salvar</button>
        </div>
      </form>
      `,
      (body) => {
        body.querySelector("#cancelModalBtn").onclick = closeModal;
        body.querySelector("#txForm").onsubmit = async (e) => {
          e.preventDefault();
          await dbApi.addDoc("financeTransactions", {
            type: body.querySelector("#txType").value,
            amount: Number(body.querySelector("#txAmount").value) || 0,
            category: body.querySelector("#txCat").value.trim(),
            date: body.querySelector("#txDate").value,
            description: body.querySelector("#txDesc").value.trim()
          });
          closeModal();
          showToast("Movimentação registrada!");
        };
      }
    );
  }

  function openFormaturaPlanModal(existing = null) {
    if (!isAdmin()) return;
    openModal(
      existing ? "Editar Item da Formatura" : "🎉 Novo Item / Fornecedor da Formatura",
      `
      <form id="planForm">
        <div class="field">
          <label>Item / Fornecedor</label>
          <input type="text" id="plTitle" value="${esc(existing?.title || "")}" placeholder="Ex: Salão de Festas, Buffet, Fotógrafo..." required />
        </div>
        <div class="form-row-2">
          <div class="field">
            <label>Categoria</label>
            <input type="text" id="plCat" value="${esc(existing?.category || "")}" placeholder="Espaço, Som, Buffet, Colação..." />
          </div>
          <div class="field">
            <label>Status</label>
            <select id="plStatus">
              <option value="pesquisando" ${!existing || existing.status === "pesquisando" ? "selected" : ""}>Pesquisando</option>
              <option value="negociando" ${existing?.status === "negociando" ? "selected" : ""}>Negociando</option>
              <option value="fechado" ${existing?.status === "fechado" ? "selected" : ""}>Fechado ✓</option>
            </select>
          </div>
        </div>
        <div class="form-row-2">
          <div class="field">
            <label>Valor Estimado (R$)</label>
            <input type="number" id="plCost" min="0" step="50" value="${esc(existing?.estimatedCost || "")}" />
          </div>
          <div class="field">
            <label>Contato (opcional)</label>
            <input type="text" id="plContact" value="${esc(existing?.contact || "")}" />
          </div>
        </div>
        <div class="field">
          <label>Observações</label>
          <textarea id="plNotes" rows="3">${esc(existing?.notes || "")}</textarea>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-ghost" id="cancelModalBtn">Cancelar</button>
          <button type="submit" class="btn-primary">Salvar</button>
        </div>
      </form>
      `,
      (body) => {
        body.querySelector("#cancelModalBtn").onclick = closeModal;
        body.querySelector("#planForm").onsubmit = async (e) => {
          e.preventDefault();
          const payload = {
            title: body.querySelector("#plTitle").value.trim(),
            category: body.querySelector("#plCat").value.trim() || "Formatura",
            status: body.querySelector("#plStatus").value,
            estimatedCost: Number(body.querySelector("#plCost").value) || 0,
            contact: body.querySelector("#plContact").value.trim(),
            notes: body.querySelector("#plNotes").value.trim()
          };
          if (existing) await dbApi.updateDoc("formaturaPlans", existing.id, payload);
          else await dbApi.addDoc("formaturaPlans", payload);
          closeModal();
          showToast("Item salvo!");
        };
      }
    );
  }

  function openAdminShirtOrderModal(existing = null) {
    if (!isAdmin()) return;
    const sizes = ["PP", "P", "M", "G", "GG", "XG", "Baby Look P", "Baby Look M", "Baby Look G"];
    const sizeOpts = sizes
      .map((sz) => `<option value="${esc(sz)}" ${(existing?.shirtSize || "M") === sz ? "selected" : ""}>${esc(sz)}</option>`)
      .join("");
    openModal(
      existing ? `Editar Camisa — ${existing.studentName}` : "👕 Cadastrar Camisa de Aluno (Admin)",
      `
      <form id="admShirtForm">
        <div class="field">
          <label>Nome do Aluno</label>
          <input type="text" id="asStudent" value="${esc(existing?.studentName || "")}" required />
        </div>
        <div class="form-row-2">
          <div class="field">
            <label>Nome na Camisa</label>
            <input type="text" id="asShirtName" value="${esc(existing?.shirtName || "")}" maxlength="24" required />
          </div>
          <div class="field">
            <label>Tamanho</label>
            <select id="asSize">${sizeOpts}</select>
          </div>
        </div>
        <div class="form-row-2">
          <div class="field">
            <label>Número (opcional)</label>
            <input type="text" id="asNum" value="${esc(existing?.shirtNumber || "")}" maxlength="4" />
          </div>
          <div class="field">
            <label>Observação</label>
            <input type="text" id="asNotes" value="${esc(existing?.notes || "")}" />
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-ghost" id="cancelModalBtn">Cancelar</button>
          <button type="submit" class="btn-primary">Salvar</button>
        </div>
      </form>
      `,
      (body) => {
        body.querySelector("#cancelModalBtn").onclick = closeModal;
        body.querySelector("#admShirtForm").onsubmit = async (e) => {
          e.preventDefault();
          const orderId = existing ? existing.id : uid("ord");
          await dbApi.saveShirtOrder(orderId, {
            uid: existing?.uid || orderId,
            studentName: body.querySelector("#asStudent").value.trim(),
            shirtName: body.querySelector("#asShirtName").value.trim(),
            shirtSize: body.querySelector("#asSize").value,
            shirtNumber: body.querySelector("#asNum").value.trim(),
            notes: body.querySelector("#asNotes").value.trim()
          });
          closeModal();
          showToast("Camisa salva!");
        };
      }
    );
  }

  function openSportModal(existing = null) {
    if (!isAdmin()) return;
    openModal(
      existing ? `Editar ${existing.name}` : "🏆 Nova Modalidade / Time",
      `
      <form id="sportForm">
        <div class="form-row-2">
          <div class="field">
            <label>Modalidade</label>
            <input type="text" id="spName" value="${esc(existing?.name || "")}" placeholder="Ex: Futsal, Vôlei, Xadrez..." required />
          </div>
          <div class="field">
            <label>Emoji</label>
            <input type="text" id="spIcon" value="${esc(existing?.icon || "🏅")}" maxlength="4" />
          </div>
        </div>
        <div class="form-row-2">
          <div class="field">
            <label>Categoria</label>
            <input type="text" id="spCat" value="${esc(existing?.category || "")}" placeholder="Masculino / Feminino / Misto" />
          </div>
          <div class="field">
            <label>Capitão(ã)</label>
            <input type="text" id="spCap" value="${esc(existing?.captain || "")}" />
          </div>
        </div>
        <div class="field">
          <label>Anotações / Treino</label>
          <textarea id="spNotes" rows="3">${esc(existing?.notes || "")}</textarea>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-ghost" id="cancelModalBtn">Cancelar</button>
          <button type="submit" class="btn-primary">Salvar</button>
        </div>
      </form>
      `,
      (body) => {
        body.querySelector("#cancelModalBtn").onclick = closeModal;
        body.querySelector("#sportForm").onsubmit = async (e) => {
          e.preventDefault();
          const payload = {
            name: body.querySelector("#spName").value.trim(),
            icon: body.querySelector("#spIcon").value.trim() || "🏅",
            category: body.querySelector("#spCat").value.trim() || "Misto",
            captain: body.querySelector("#spCap").value.trim() || "A definir",
            notes: body.querySelector("#spNotes").value.trim()
          };
          if (existing) await dbApi.updateDoc("interclasseSports", existing.id, payload);
          else await dbApi.addDoc("interclasseSports", { ...payload, players: [] });
          closeModal();
          showToast("Modalidade salva!");
        };
      }
    );
  }

  function openGameModal(existing = null) {
    if (!isAdmin()) return;
    const modalityOptions = data.interclasseSports.map((s) => `<option value="${esc(s.name)}"></option>`).join("");
    openModal(
      existing ? "Editar Data / Placar do Jogo" : "📅 Agendar Jogo por Modalidade",
      `
      <form id="gameForm">
        <div class="form-row-2">
          <div class="field">
            <label>Modalidade</label>
            <input type="text" id="gmSport" list="gmModList" value="${esc(existing?.sportName || "")}" placeholder="Ex: Futsal, Vôlei, E-Sports..." required />
            <datalist id="gmModList">${modalityOptions}</datalist>
          </div>
          <div class="field">
            <label>Adversário</label>
            <input type="text" id="gmOpp" value="${esc(existing?.opponent || "")}" placeholder="Ex: 2º Ano A" required />
          </div>
        </div>
        <div class="form-row-2">
          <div class="field">
            <label>Data</label>
            <input type="date" id="gmDate" value="${esc(existing?.date || "")}" required />
          </div>
          <div class="field">
            <label>Horário</label>
            <input type="text" id="gmTime" value="${esc(existing?.time || "")}" placeholder="09:00" />
          </div>
        </div>
        <div class="form-row-2">
          <div class="field">
            <label>Local / Quadra</label>
            <input type="text" id="gmLoc" value="${esc(existing?.location || "")}" placeholder="Quadra Principal" />
          </div>
          <div class="field">
            <label>Placar</label>
            <input type="text" id="gmScore" value="${esc(existing?.score || "A jogar")}" />
          </div>
        </div>
        <div class="form-row-2">
          <div class="field">
            <label>Resultado</label>
            <select id="gmRes">
              <option value="agendado" ${!existing || existing.result === "agendado" ? "selected" : ""}>Agendado</option>
              <option value="vitoria" ${existing?.result === "vitoria" ? "selected" : ""}>Vitória 🏆</option>
              <option value="empate" ${existing?.result === "empate" ? "selected" : ""}>Empate</option>
              <option value="derrota" ${existing?.result === "derrota" ? "selected" : ""}>Derrota</option>
            </select>
          </div>
          <div class="field">
            <label>Observação (opcional)</label>
            <input type="text" id="gmNotes" value="${esc(existing?.notes || "")}" />
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-ghost" id="cancelModalBtn">Cancelar</button>
          <button type="submit" class="btn-primary">Salvar Jogo</button>
        </div>
      </form>
      `,
      (body) => {
        body.querySelector("#cancelModalBtn").onclick = closeModal;
        body.querySelector("#gameForm").onsubmit = async (e) => {
          e.preventDefault();
          const payload = {
            sportName: body.querySelector("#gmSport").value.trim(),
            opponent: body.querySelector("#gmOpp").value.trim(),
            date: body.querySelector("#gmDate").value,
            time: body.querySelector("#gmTime").value.trim(),
            location: body.querySelector("#gmLoc").value.trim(),
            score: body.querySelector("#gmScore").value.trim() || "A jogar",
            result: body.querySelector("#gmRes").value,
            notes: body.querySelector("#gmNotes").value.trim()
          };
          if (existing) await dbApi.updateDoc("interclasseGames", existing.id, payload);
          else await dbApi.addDoc("interclasseGames", payload);
          closeModal();
          showToast("Jogo salvo!");
        };
      }
    );
  }

  function openShirtModelModal() {
    if (!isAdmin()) return;
    openModal(
      "👕 Adicionar Modelo de Camiseta",
      `
      <form id="shModelForm">
        <div class="field">
          <label>Nome do Modelo</label>
          <input type="text" id="smName" placeholder="Ex: 07 • Dourado Clássico" required />
        </div>
        <div class="field">
          <label>Cores / Paleta</label>
          <input type="text" id="smPalette" placeholder="Ex: Preto e Laranja" />
        </div>
        <div class="field">
          <label>Caminho ou URL da Imagem</label>
          <input type="text" id="smImg" placeholder="camisetas_interclasse_2027/arquivo.jpg ou https://..." required />
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-ghost" id="cancelModalBtn">Cancelar</button>
          <button type="submit" class="btn-primary">Adicionar</button>
        </div>
      </form>
      `,
      (body) => {
        body.querySelector("#cancelModalBtn").onclick = closeModal;
        body.querySelector("#shModelForm").onsubmit = async (e) => {
          e.preventDefault();
          await dbApi.addDoc("shirtModels", {
            name: body.querySelector("#smName").value.trim(),
            palette: body.querySelector("#smPalette").value.trim(),
            image: body.querySelector("#smImg").value.trim(),
            order: data.shirtModels.length + 1
          });
          closeModal();
          showToast("Modelo adicionado!");
        };
      }
    );
  }

  function openInterNoteModal() {
    if (!isAdmin()) return;
    openModal(
      "📝 Nova Anotação do Interclasse",
      `
      <form id="inoteForm">
        <div class="form-row-2">
          <div class="field">
            <label>Título</label>
            <input type="text" id="inTitle" required />
          </div>
          <div class="field">
            <label>Etiqueta</label>
            <input type="text" id="inTag" value="Geral" />
          </div>
        </div>
        <div class="field">
          <label>Conteúdo</label>
          <textarea id="inContent" rows="4" required></textarea>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-ghost" id="cancelModalBtn">Cancelar</button>
          <button type="submit" class="btn-primary">Salvar</button>
        </div>
      </form>
      `,
      (body) => {
        body.querySelector("#cancelModalBtn").onclick = closeModal;
        body.querySelector("#inoteForm").onsubmit = async (e) => {
          e.preventDefault();
          await dbApi.addDoc("interclasseNotes", {
            kind: "note",
            title: body.querySelector("#inTitle").value.trim(),
            tag: body.querySelector("#inTag").value.trim() || "Geral",
            content: body.querySelector("#inContent").value.trim()
          });
          closeModal();
          showToast("Anotação salva!");
        };
      }
    );
  }

  function openTroteModal(existing = null, prefillDate = "") {
    if (!isAdmin()) return;
    const defaultDate = existing?.date || prefillDate || `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-15`;
    openModal(
      existing ? "Editar Trote" : "🎭 Novo Trote no Calendário",
      `
      <form id="troteForm">
        <div class="field">
          <label>Nome do Trote</label>
          <input type="text" id="trTitle" value="${esc(existing?.title || "")}" required />
        </div>
        <div class="form-row-2">
          <div class="field">
            <label>Data</label>
            <input type="date" id="trDate" value="${esc(defaultDate)}" required />
          </div>
          <div class="field">
            <label>Status</label>
            <select id="trStatus">
              <option value="planejado" ${!existing || existing.status === "planejado" ? "selected" : ""}>Planejado</option>
              <option value="confirmado" ${existing?.status === "confirmado" ? "selected" : ""}>Confirmado</option>
              <option value="realizado" ${existing?.status === "realizado" ? "selected" : ""}>Realizado</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label>Tema / Categoria</label>
          <input type="text" id="trTheme" value="${esc(existing?.theme || "")}" />
        </div>
        <div class="field">
          <label>Descrição</label>
          <textarea id="trDesc" rows="3" required>${esc(existing?.description || "")}</textarea>
        </div>
        <div class="field">
          <label>Dica / Combinado (opcional)</label>
          <input type="text" id="trTips" value="${esc(existing?.tips || "")}" />
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-ghost" id="cancelModalBtn">Cancelar</button>
          <button type="submit" class="btn-primary">Salvar Trote</button>
        </div>
      </form>
      `,
      (body) => {
        body.querySelector("#cancelModalBtn").onclick = closeModal;
        body.querySelector("#troteForm").onsubmit = async (e) => {
          e.preventDefault();
          const payload = {
            title: body.querySelector("#trTitle").value.trim(),
            date: body.querySelector("#trDate").value,
            status: body.querySelector("#trStatus").value,
            theme: body.querySelector("#trTheme").value.trim(),
            description: body.querySelector("#trDesc").value.trim(),
            tips: body.querySelector("#trTips").value.trim()
          };
          if (payload.date) {
            const [y, m] = payload.date.split("-").map(Number);
            if (y && m) {
              calendarYear = y;
              calendarMonth = m - 1;
            }
          }
          if (existing) await dbApi.updateDoc("trotes", existing.id, payload);
          else await dbApi.addDoc("trotes", payload);
          closeModal();
          showToast("Trote salvo!");
        };
      }
    );
  }

  function openTroteIdeaModal() {
    if (!isAdmin()) return;
    openModal(
      "💡 Adicionar Ideia ou Regra de Trote",
      `
      <form id="tIdeaForm">
        <div class="field">
          <label>Tipo</label>
          <select id="tiKind">
            <option value="idea">💡 Ideia de Tema para Trote</option>
            <option value="rule">📜 Regra / Autorização da Escola</option>
          </select>
        </div>
        <div class="field">
          <label>Título</label>
          <input type="text" id="tiTitle" required />
        </div>
        <div class="field">
          <label>Detalhes</label>
          <textarea id="tiDetails" rows="3"></textarea>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-ghost" id="cancelModalBtn">Cancelar</button>
          <button type="submit" class="btn-primary">Salvar</button>
        </div>
      </form>
      `,
      (body) => {
        body.querySelector("#cancelModalBtn").onclick = closeModal;
        body.querySelector("#tIdeaForm").onsubmit = async (e) => {
          e.preventDefault();
          await dbApi.addDoc("troteIdeas", {
            kind: body.querySelector("#tiKind").value,
            title: body.querySelector("#tiTitle").value.trim(),
            details: body.querySelector("#tiDetails").value.trim()
          });
          closeModal();
          showToast("Salvo!");
        };
      }
    );
  }

  function openPollModal() {
    if (!isAdmin()) return;
    openModal(
      "📊 Criar Nova Enquete",
      `
      <form id="pollForm">
        <div class="field">
          <label>Pergunta</label>
          <input type="text" id="plQ" required />
        </div>
        <div class="field">
          <label>Categoria</label>
          <input type="text" id="plCat" value="Organização" />
        </div>
        <div class="field">
          <label>Opções (uma por linha — mínimo 2)</label>
          <textarea id="plOpts" rows="4" required></textarea>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-ghost" id="cancelModalBtn">Cancelar</button>
          <button type="submit" class="btn-primary">Publicar Enquete</button>
        </div>
      </form>
      `,
      (body) => {
        body.querySelector("#cancelModalBtn").onclick = closeModal;
        body.querySelector("#pollForm").onsubmit = async (e) => {
          e.preventDefault();
          const lines = body
            .querySelector("#plOpts")
            .value.split("\n")
            .map((l) => l.trim())
            .filter(Boolean);
          if (lines.length < 2) {
            showToast("Adicione pelo menos 2 opções!");
            return;
          }
          await dbApi.addDoc("polls", {
            question: body.querySelector("#plQ").value.trim(),
            category: body.querySelector("#plCat").value.trim() || "Sala",
            options: lines.map((label, idx) => ({ id: "op" + (idx + 1), label })),
            createdAt: new Date().toISOString()
          });
          closeModal();
          showToast("Enquete publicada!");
        };
      }
    );
  }

  function openMemberModal(existing = null) {
    if (!isAdmin()) return;
    openModal(
      existing ? `Editar ${existing.fullName}` : "👤 Adicionar Aluno & Função",
      `
      <form id="memberForm">
        <div class="field">
          <label>Nome Completo</label>
          <input type="text" id="mbName" value="${esc(existing?.fullName || "")}" required />
        </div>
        <div class="form-row-2">
          <div class="field">
            <label>Função na Sala</label>
            <input type="text" id="mbRole" value="${esc(existing?.roleInClass || "Aluno")}" placeholder="Ex: Tesouraria, Esportes, Trotes, Aluno..." required />
          </div>
          <div class="field">
            <label>Contato (opcional)</label>
            <input type="text" id="mbContact" value="${esc(existing?.contact || "")}" />
          </div>
        </div>
        <div class="field">
          <label>Observações (opcional)</label>
          <input type="text" id="mbNotes" value="${esc(existing?.notes || "")}" />
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-ghost" id="cancelModalBtn">Cancelar</button>
          <button type="submit" class="btn-primary">Salvar</button>
        </div>
      </form>
      `,
      (body) => {
        body.querySelector("#cancelModalBtn").onclick = closeModal;
        body.querySelector("#memberForm").onsubmit = async (e) => {
          e.preventDefault();
          const payload = {
            fullName: body.querySelector("#mbName").value.trim(),
            roleInClass: body.querySelector("#mbRole").value.trim() || "Aluno",
            contact: body.querySelector("#mbContact").value.trim(),
            notes: body.querySelector("#mbNotes").value.trim()
          };
          if (existing) await dbApi.updateDoc("classMembers", existing.id, payload);
          else await dbApi.addDoc("classMembers", payload);
          closeModal();
          showToast("Aluno salvo!");
        };
      }
    );
  }

  function openTaskModal() {
    if (!isAdmin()) return;
    openModal(
      "📌 Nova Tarefa da Comissão",
      `
      <form id="taskForm">
        <div class="field">
          <label>Descrição da Tarefa</label>
          <input type="text" id="tkTitle" required />
        </div>
        <div class="form-row-2">
          <div class="field">
            <label>Área</label>
            <select id="tkArea">
              <option value="Formatura">Formatura</option>
              <option value="Interclasse">Interclasse</option>
              <option value="Trotes">Trotes</option>
              <option value="Organização">Organização</option>
            </select>
          </div>
          <div class="field">
            <label>Responsável</label>
            <input type="text" id="tkOwner" required />
          </div>
        </div>
        <div class="field">
          <label>Prazo (opcional)</label>
          <input type="date" id="tkDue" />
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-ghost" id="cancelModalBtn">Cancelar</button>
          <button type="submit" class="btn-primary">Criar Tarefa</button>
        </div>
      </form>
      `,
      (body) => {
        body.querySelector("#cancelModalBtn").onclick = closeModal;
        body.querySelector("#taskForm").onsubmit = async (e) => {
          e.preventDefault();
          await dbApi.addDoc("tasks", {
            title: body.querySelector("#tkTitle").value.trim(),
            area: body.querySelector("#tkArea").value,
            owner: body.querySelector("#tkOwner").value.trim(),
            due: body.querySelector("#tkDue").value,
            status: "todo"
          });
          closeModal();
          showToast("Tarefa criada!");
        };
      }
    );
  }

  function openMeetingModal() {
    if (!isAdmin()) return;
    openModal(
      "📋 Nova Ata de Reunião",
      `
      <form id="meetingForm">
        <div class="form-row-2">
          <div class="field">
            <label>Título</label>
            <input type="text" id="mtTitle" required />
          </div>
          <div class="field">
            <label>Data</label>
            <input type="date" id="mtDate" value="${new Date().toISOString().slice(0, 10)}" required />
          </div>
        </div>
        <div class="field">
          <label>Resumo das Decisões</label>
          <textarea id="mtSummary" rows="4" required></textarea>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-ghost" id="cancelModalBtn">Cancelar</button>
          <button type="submit" class="btn-primary">Salvar Ata</button>
        </div>
      </form>
      `,
      (body) => {
        body.querySelector("#cancelModalBtn").onclick = closeModal;
        body.querySelector("#meetingForm").onsubmit = async (e) => {
          e.preventDefault();
          await dbApi.addDoc("meetings", {
            title: body.querySelector("#mtTitle").value.trim(),
            date: body.querySelector("#mtDate").value,
            summary: body.querySelector("#mtSummary").value.trim()
          });
          closeModal();
          showToast("Ata registrada!");
        };
      }
    );
  }

  function openAddAccessRoleModal() {
    if (!isAdmin()) return;
    openModal(
      "🛡️ Pré-cadastrar Permissão (Admin ou Aluno)",
      `
      <div class="helper-note">
        Informe o <strong>e-mail ou telefone</strong> da pessoa e escolha se ela será <strong>Admin (Organizador)</strong> ou <strong>Aluno</strong>. Assim que ela criar conta ou fizer login, receberá essa permissão automaticamente.
      </div>
      <form id="accessRoleForm">
        <div class="field">
          <label>Nome Completo (opcional)</label>
          <input type="text" id="arName" placeholder="Ex: Lucas Mendes" />
        </div>
        <div class="field">
          <label>E-mail ou Telefone (com DDD)</label>
          <input type="text" id="arContact" placeholder="organizador@gmail.com ou (11) 99999-9999" required />
        </div>
        <div class="field">
          <label>Cargo / Permissão</label>
          <select id="arRole">
            <option value="admin">🛡️ Admin (Organizador — pode editar tudo)</option>
            <option value="aluno">🎓 Aluno (visualização + própria camisa + votos)</option>
          </select>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-ghost" id="cancelModalBtn">Cancelar</button>
          <button type="submit" class="btn-primary">Salvar Permissão</button>
        </div>
      </form>
      `,
      (body) => {
        body.querySelector("#cancelModalBtn").onclick = closeModal;
        body.querySelector("#accessRoleForm").onsubmit = async (e) => {
          e.preventDefault();
          const parsed = normalizeIdentifier(body.querySelector("#arContact").value);
          if (!parsed.valid) {
            showToast(parsed.error);
            return;
          }
          await dbApi.setAccessRole(parsed.authEmail, {
            fullName: body.querySelector("#arName").value.trim(),
            displayContact: parsed.displayContact,
            role: body.querySelector("#arRole").value
          });
          closeModal();
          showToast("Permissão registrada!");
        };
      }
    );
  }

  // ==========================================================================
  // EVENT BINDINGS
  // ==========================================================================
  function bindEvents() {
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    document.getElementById("openSidebarBtn").addEventListener("click", openMobileSidebar);
    document.getElementById("closeSidebarBtn").addEventListener("click", closeMobileSidebar);
    document.getElementById("sidebarOverlay").addEventListener("click", closeMobileSidebar);

    document.getElementById("themeToggleBtn").addEventListener("click", () => {
      const next = (localStorage.getItem(THEME_KEY) || "dark") === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_KEY, next);
      applyTheme();
    });

    document.getElementById("openAuthBtn").addEventListener("click", () => openAuthModal("login"));
    document.getElementById("logoutBtn").addEventListener("click", logoutAccount);
    document.getElementById("settingsBtn").addEventListener("click", openSettingsModal);
    document.getElementById("editGoalBtn").addEventListener("click", openSettingsModal);

    // Modal & Lightbox
    document.getElementById("closeModalBtn").addEventListener("click", closeModal);
    document.getElementById("modalBackdrop").addEventListener("click", (e) => {
      if (e.target.id === "modalBackdrop") closeModal();
    });
    document.getElementById("closeLightboxBtn").addEventListener("click", closeLightbox);
    document.getElementById("lightbox").addEventListener("click", (e) => {
      if (e.target.id === "lightbox") closeLightbox();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeModal();
        closeLightbox();
      }
    });

    // Admin Add Buttons
    document.getElementById("addNoticeBtn").addEventListener("click", openAddNoticeModal);
    document.getElementById("addTransactionBtn").addEventListener("click", openTransactionModal);
    document.getElementById("addFormaturaPlanBtn").addEventListener("click", () => openFormaturaPlanModal());
    document.getElementById("adminAddShirtOrderBtn").addEventListener("click", () => openAdminShirtOrderModal());
    document.getElementById("addGameBtn").addEventListener("click", () => openGameModal());
    document.getElementById("addSportBtn").addEventListener("click", () => openSportModal());
    document.getElementById("addShirtModelBtn").addEventListener("click", openShirtModelModal);
    document.getElementById("addInterNoteBtn").addEventListener("click", openInterNoteModal);
    document.getElementById("addTroteBtn").addEventListener("click", () => openTroteModal());
    document.getElementById("addTroteIdeaBtn").addEventListener("click", openTroteIdeaModal);
    document.getElementById("addPollBtn").addEventListener("click", openPollModal);
    document.getElementById("addMemberBtn").addEventListener("click", () => openMemberModal());
    document.getElementById("addTaskBtn").addEventListener("click", openTaskModal);
    document.getElementById("addMeetingBtn").addEventListener("click", openMeetingModal);
    document.getElementById("addAccessRoleBtn").addEventListener("click", openAddAccessRoleModal);

    // Load the 6 real shirt art files from folder (0 votes)
    document.getElementById("loadPresetShirtsBtn").addEventListener("click", async () => {
      if (!isAdmin()) return;
      const presets = window.TERCEIRAO_FIREBASE?.shirtAssetPresets || [];
      for (const sh of presets) {
        await dbApi.addDoc("shirtModels", sh, sh.id);
      }
      showToast("Os 6 modelos de camiseta da pasta foram carregados!");
    });

    // Interclasse Checklist form
    document.getElementById("interChecklistForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!isAdmin()) return;
      const input = document.getElementById("interChecklistInput");
      const text = input.value.trim();
      if (!text) return;
      await dbApi.addDoc("interclasseNotes", { kind: "check", title: text, done: false });
      input.value = "";
    });

    // Filters & inputs
    document.getElementById("txTypeFilter").addEventListener("change", renderFormatura);
    document.getElementById("simStudents").addEventListener("input", updateSimulator);
    document.getElementById("simMonths").addEventListener("input", updateSimulator);
    document.getElementById("shirtOrderSearch").addEventListener("input", renderInterCamisas);
    document.getElementById("gamesModalityFilter").addEventListener("change", renderInterDatas);
    document.getElementById("troteStatusFilter").addEventListener("change", renderTrotes);
    document.getElementById("memberSearchInput").addEventListener("input", renderOrgAlunos);
    document.getElementById("accessRoleFilter").addEventListener("change", renderAdminAccess);
    document.getElementById("accessSearchInput").addEventListener("input", renderAdminAccess);

    // Calendar month nav
    document.getElementById("prevMonthBtn").addEventListener("click", () => {
      calendarMonth--;
      if (calendarMonth < 0) {
        calendarMonth = 11;
        calendarYear--;
      }
      renderTrotes();
    });
    document.getElementById("nextMonthBtn").addEventListener("click", () => {
      calendarMonth++;
      if (calendarMonth > 11) {
        calendarMonth = 0;
        calendarYear++;
      }
      renderTrotes();
    });

    // WhatsApp Copy Buttons
    document.getElementById("copyNoticesWhatsappBtn").addEventListener("click", () => {
      if (!data.notices.length) return showToast("Nenhum aviso para copiar.");
      const lines = data.notices.map((n) => `• *${n.title}*\n  ${n.body} _(${n.author})_`);
      copyToClipboard(`📢 *AVISOS DO TERCEIRÃO 2027*\n\n${lines.join("\n\n")}`);
    });

    document.getElementById("copyFinanceWhatsappBtn").addEventListener("click", () => {
      const fin = computeFinanceStats();
      copyToClipboard(
        `💰 *CAIXA DA FORMATURA 2027*\n\n` +
          `✅ Saldo atual: *${formatBRL(fin.balance)}*\n` +
          `🎯 Meta: ${fin.goal > 0 ? `${formatBRL(fin.goal)} (${fin.pct.toFixed(1)}%)` : "A definir"}\n` +
          `📈 Entradas: ${formatBRL(fin.totalIn)} | 📉 Saídas: ${formatBRL(fin.totalOut)}`
      );
    });

    document.getElementById("copyShirtOrdersBtn").addEventListener("click", () => {
      if (!data.shirtOrders.length) return showToast("Nenhuma camisa cadastrada.");
      const counts = {};
      data.shirtOrders.forEach((o) => {
        counts[o.shirtSize] = (counts[o.shirtSize] || 0) + 1;
      });
      const summary = Object.entries(counts).map(([sz, q]) => `${sz}: ${q}`).join(" | ");
      const rows = [...data.shirtOrders]
        .sort((a, b) => (a.studentName || "").localeCompare(b.studentName || ""))
        .map((o) => `• ${o.studentName} — Nome: *${o.shirtName}*${o.shirtNumber ? ` (#${o.shirtNumber})` : ""} | Tam: *${o.shirtSize}*`)
        .join("\n");
      copyToClipboard(`👕 *PEDIDO CAMISAS INTERCLASSE 2027*\nGrade: ${summary}\n\n${rows}`);
    });

    document.getElementById("copyShirtsSummaryBtn").addEventListener("click", () => {
      if (!data.shirtModels.length) return showToast("Nenhum modelo cadastrado.");
      const counts = {};
      data.shirtVotes.forEach((v) => {
        counts[v.modelId] = (counts[v.modelId] || 0) + 1;
      });
      const total = data.shirtVotes.length || 1;
      const lines = [...data.shirtModels]
        .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0))
        .map((m, i) => `${i + 1}º *${m.name}* — ${counts[m.id] || 0} voto(s) (${Math.round(((counts[m.id] || 0) / total) * 100)}%)`);
      copyToClipboard(`👕 *PARCIAL VOTAÇÃO CAMISETAS 2027*\n\n${lines.join("\n")}`);
    });

    document.getElementById("copyTrotesWhatsappBtn").addEventListener("click", () => {
      if (!data.trotes.length) return showToast("Nenhum trote cadastrado.");
      const lines = [...data.trotes]
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
        .map((t) => `📅 *${formatDateBR(t.date)}* — *${t.title}* [${t.status.toUpperCase()}]\n   ${t.description}`);
      copyToClipboard(`🎭 *CALENDÁRIO DE TROTES 2027*\n\n${lines.join("\n\n")}`);
    });

    // Global delegated events in mainContent
    const main = document.getElementById("mainContent");

    main.addEventListener("submit", async (e) => {
      // Own shirt form (Student or Admin)
      if (e.target.id === "ownShirtForm") {
        e.preventDefault();
        if (!isLoggedIn()) return openAuthModal("login");
        try {
          await dbApi.saveShirtOrder(currentUser.uid, {
            uid: currentUser.uid,
            studentName: currentUser.fullName,
            shirtName: document.getElementById("ownShirtName").value.trim(),
            shirtSize: document.getElementById("ownShirtSize").value,
            shirtNumber: document.getElementById("ownShirtNumber").value.trim(),
            notes: document.getElementById("ownShirtNotes").value.trim()
          });
          showToast("Sua camisa foi salva com sucesso!");
        } catch (err) {
          showToast(mapAuthError(err));
        }
        return;
      }

      // Add player to sport team (Admin only)
      const playerForm = e.target.closest("[data-add-player-form]");
      if (playerForm && isAdmin()) {
        e.preventDefault();
        const sp = data.interclasseSports.find((x) => x.id === playerForm.dataset.addPlayerForm);
        const input = playerForm.querySelector("input");
        const pName = input.value.trim();
        if (sp && pName) {
          const players = [...(sp.players || []), pName];
          await dbApi.updateDoc("interclasseSports", sp.id, { players });
          input.value = "";
        }
      }
    });

    main.addEventListener("click", async (e) => {
      const target = e.target.closest("button, [data-jump], [data-zoom-shirt], [data-vote-poll], [data-toggle-check]");
      if (!target) return;

      if (target.id === "ownShirtLoginPromptBtn" || target.dataset.openAuth) {
        openAuthModal("login");
        return;
      }

      if (target.id === "deleteOwnShirtBtn" && isLoggedIn()) {
        if (confirm("Deseja remover o registro da sua camisa?")) {
          await dbApi.deleteDoc("shirtOrders", currentUser.uid);
          showToast("Registro da sua camisa removido.");
        }
        return;
      }

      if (target.dataset.jump) {
        switchTab(target.dataset.jump);
        return;
      }

      if (target.dataset.zoomShirt) {
        const sh = data.shirtModels.find((x) => x.id === target.dataset.zoomShirt);
        if (sh) openLightbox(sh.image, sh.name, sh.palette || "");
        return;
      }

      // Public / Logged-in Voting
      if (target.dataset.voteShirt) {
        if (!isLoggedIn()) return openAuthModal("login");
        await dbApi.voteShirt(target.dataset.voteShirt);
        showToast("Voto registrado!");
        return;
      }

      if (target.dataset.votePoll) {
        if (!isLoggedIn()) {
          showToast("Faça login para votar na enquete.");
          return openAuthModal("login");
        }
        await dbApi.votePoll(target.dataset.votePoll, target.dataset.voteOpt);
        showToast("Voto computado!");
        return;
      }

      // Copy buttons
      if (target.dataset.copyTrote) {
        const t = data.trotes.find((x) => x.id === target.dataset.copyTrote);
        if (t) {
          copyToClipboard(`🎭 *TROTE — ${t.title}*\n📅 ${formatDateBR(t.date)}\n\n${t.description}${t.tips ? `\n\n💡 ${t.tips}` : ""}`);
        }
        return;
      }
      if (target.dataset.copyPoll) {
        const poll = data.polls.find((x) => x.id === target.dataset.copyPoll);
        if (poll) {
          const votes = data.pollVotes[poll.id] || [];
          const total = votes.length || 1;
          const lines = (poll.options || []).map((o) => {
            const c = votes.filter((v) => v.optionId === o.id).length;
            return `• ${o.label}: *${c}* (${Math.round((c / total) * 100)}%)`;
          });
          copyToClipboard(`📊 *ENQUETE:* ${poll.question}\n\n${lines.join("\n")}`);
        }
        return;
      }
      if (target.dataset.copyMeeting) {
        const mt = data.meetings.find((x) => x.id === target.dataset.copyMeeting);
        if (mt) copyToClipboard(`📋 *ATA — ${mt.title} (${formatDateBR(mt.date)})*\n\n${mt.summary}`);
        return;
      }

      // Calendar click (only admin opens edit/add)
      if (target.dataset.calDate) {
        if (!isAdmin()) return;
        const tid = target.dataset.troteId;
        if (tid) {
          const t = data.trotes.find((x) => x.id === tid);
          if (t) openTroteModal(t);
        } else {
          openTroteModal(null, target.dataset.calDate);
        }
        return;
      }

      // Everything below is ADMIN ONLY
      if (!isAdmin()) return;

      if (target.dataset.deleteNotice) return dbApi.deleteDoc("notices", target.dataset.deleteNotice);
      if (target.dataset.deleteTx) return dbApi.deleteDoc("financeTransactions", target.dataset.deleteTx);

      if (target.dataset.editPlan) {
        const p = data.formaturaPlans.find((x) => x.id === target.dataset.editPlan);
        if (p) openFormaturaPlanModal(p);
        return;
      }
      if (target.dataset.deletePlan) return dbApi.deleteDoc("formaturaPlans", target.dataset.deletePlan);

      if (target.dataset.adminEditShirtorder) {
        const o = data.shirtOrders.find((x) => x.id === target.dataset.adminEditShirtorder);
        if (o) openAdminShirtOrderModal(o);
        return;
      }
      if (target.dataset.adminDeleteShirtorder) return dbApi.deleteDoc("shirtOrders", target.dataset.adminDeleteShirtorder);

      if (target.dataset.editGame) {
        const g = data.interclasseGames.find((x) => x.id === target.dataset.editGame);
        if (g) openGameModal(g);
        return;
      }
      if (target.dataset.deleteGame) return dbApi.deleteDoc("interclasseGames", target.dataset.deleteGame);

      if (target.dataset.editSport) {
        const sp = data.interclasseSports.find((x) => x.id === target.dataset.editSport);
        if (sp) openSportModal(sp);
        return;
      }
      if (target.dataset.deleteSport) return dbApi.deleteDoc("interclasseSports", target.dataset.deleteSport);
      if (target.dataset.removePlayer) {
        const sp = data.interclasseSports.find((x) => x.id === target.dataset.removePlayer);
        if (sp) {
          const players = [...(sp.players || [])];
          players.splice(Number(target.dataset.playerIdx), 1);
          await dbApi.updateDoc("interclasseSports", sp.id, { players });
        }
        return;
      }

      if (target.dataset.deleteShirtmodel) return dbApi.deleteDoc("shirtModels", target.dataset.deleteShirtmodel);
      if (target.dataset.deleteInternote) return dbApi.deleteDoc("interclasseNotes", target.dataset.deleteInternote);
      if (target.dataset.toggleCheck) {
        const c = data.interclasseNotes.find((x) => x.id === target.dataset.toggleCheck);
        if (c) await dbApi.updateDoc("interclasseNotes", c.id, { done: !c.done });
        return;
      }

      if (target.dataset.cycleTrote) {
        const t = data.trotes.find((x) => x.id === target.dataset.cycleTrote);
        if (t) {
          const seq = ["planejado", "confirmado", "realizado"];
          await dbApi.updateDoc("trotes", t.id, { status: seq[(seq.indexOf(t.status) + 1) % seq.length] });
        }
        return;
      }
      if (target.dataset.editTrote) {
        const t = data.trotes.find((x) => x.id === target.dataset.editTrote);
        if (t) openTroteModal(t);
        return;
      }
      if (target.dataset.deleteTrote) return dbApi.deleteDoc("trotes", target.dataset.deleteTrote);
      if (target.dataset.deleteTroteidea) return dbApi.deleteDoc("troteIdeas", target.dataset.deleteTroteidea);

      if (target.dataset.deletePoll) return dbApi.deleteDoc("polls", target.dataset.deletePoll);

      if (target.dataset.editMember) {
        const m = data.classMembers.find((x) => x.id === target.dataset.editMember);
        if (m) openMemberModal(m);
        return;
      }
      if (target.dataset.deleteMember) return dbApi.deleteDoc("classMembers", target.dataset.deleteMember);

      if (target.dataset.moveTask) {
        await dbApi.updateDoc("tasks", target.dataset.moveTask, { status: target.dataset.targetStatus });
        return;
      }
      if (target.dataset.deleteTask) return dbApi.deleteDoc("tasks", target.dataset.deleteTask);
      if (target.dataset.deleteMeeting) return dbApi.deleteDoc("meetings", target.dataset.deleteMeeting);

      // Admin Access Control actions
      if (target.dataset.toggleAccessrole) {
        const authEmail = target.dataset.toggleAccessrole;
        const nextRole = target.dataset.nextRole;
        const rec = data.accessRoles.find((r) => r.authEmail === authEmail);
        if (rec) {
          await dbApi.setAccessRole(authEmail, { ...rec, role: nextRole });
          showToast(`Permissão alterada para ${nextRole === "admin" ? "Admin" : "Aluno"}!`);
        }
        return;
      }
      if (target.dataset.deleteAccessrole) {
        try {
          await dbApi.deleteAccessRole(target.dataset.deleteAccessrole);
          showToast("Permissão removida.");
        } catch (err) {
          showToast(mapAuthError(err));
        }
      }
    });
  }

  // Boot
  applyTheme();
  bindEvents();
  initBackend();
})();

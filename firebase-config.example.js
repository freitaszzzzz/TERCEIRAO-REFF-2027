// ==========================================================================
// MODELO DE CONFIGURAÇÃO DO FIREBASE (EXEMPLO PARA GITHUB)
// ==========================================================================
// Para usar com seu próprio projeto Firebase:
// 1. Renomeie (ou copie) este arquivo para "firebase-config.js"
// 2. Substitua os valores abaixo pelas chaves do seu app Web no Firebase Console
//
// Se deixar os valores padrão, o site abre automaticamente em Modo Prévia Local
// (salvando no navegador) para testes sem precisar de servidor!
// ==========================================================================

window.TERCEIRAO_FIREBASE = {
  config: {
    apiKey: "COLOQUE_SUA_API_KEY_AQUI",
    authDomain: "SEU-PROJETO.firebaseapp.com",
    projectId: "SEU-PROJETO",
    storageBucket: "SEU-PROJETO.firebasestorage.app",
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:0000000000000000000000"
  },

  isConfigured: function () {
    const c = this.config;
    return Boolean(
      c &&
      c.apiKey &&
      !c.apiKey.includes("COLOQUE_SUA") &&
      c.projectId &&
      !c.projectId.includes("SEU-PROJETO")
    );
  },

  // Modelos opcionais para a galeria de camisetas do Interclasse
  shirtAssetPresets: [
    { id: "sh1", name: "01 • Imperial Gold", palette: "Preto & Dourado", image: "camisetas_interclasse_2027/01_imperial_gold_preto_dourado.jpg", order: 1 },
    { id: "sh2", name: "02 • Cyber Wave", palette: "Azul & Ciano", image: "camisetas_interclasse_2027/02_cyber_wave_azul_ciano.jpg", order: 2 },
    { id: "sh3", name: "03 • Fênix Prism", palette: "Vermelho & Preto", image: "camisetas_interclasse_2027/03_fenix_prism_vermelho_preto.jpg", order: 3 },
    { id: "sh4", name: "04 • Esmeralda Flow", palette: "Verde & Dourado", image: "camisetas_interclasse_2027/04_esmeralda_flow_verde_dourado.jpg", order: 4 },
    { id: "sh5", name: "05 • Glacier Real", palette: "Branco, Marinho & Dourado", image: "camisetas_interclasse_2027/05_glacier_real_branco_marinho_dourado.jpg", order: 5 },
    { id: "sh6", name: "06 • Vinho Elite", palette: "Bordô & Champagne", image: "camisetas_interclasse_2027/06_vinho_elite_bordo_champagne.jpg", order: 6 }
  ]
};

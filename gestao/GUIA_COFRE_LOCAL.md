# SIG CSA-TIC — Cópias locais protegidas de relatórios V5/V6

## Por que os relatórios desapareciam após login ou atualização?

Até 17/10/2026 as prévias V5 e V6 eram mantidas **somente na memória JavaScript da aba**. A renovação da página, logout ou nova autenticação perdia as referências. **O Apps Script e as abas de origem não foram apagados.**

## Correção publicada

Foi adicionado o módulo independente [vault.js](./assets/vault.js), carregado antes de `v6.js` e `app.js`.

O cofre é **opt-in**: clicar em **Salvar cópia protegida** em cada aba após carregar o JSON. A cópia é criptografada no navegador por AES-256-GCM, usando chave derivada da frase-senha por PBKDF2 SHA-256 com 210.000 iterações e sal individual, e fica no IndexedDB. O identificador criptográfico associa a cópia a (projeto Supabase, conta autenticada, V5 ou V6). A senha do cofre não é armazenada ou transmitida.

A opção **Restaurar cópia protegida** solicita a frase-senha e abre a prévia salva no mesmo navegador, inclusive após sair e entrar novamente. **Apagar cópia local** remove o registro criptografado deste dispositivo.

O logout agora elimina da memória os relatórios V5 e V6 que estavam abertos. Não remove o cofre criptografado, cuja persistência é a finalidade da função.

## Procedimento após a atualização

1. Entre no SIG CSA-TIC no navegador em que trabalha habitualmente.
2. Se não houver relatório aberto, importe os arquivos `SIG_V5_PREVIA.json` e `SIG_V6_CONCILIACAO.json` da pasta Downloads do dispositivo. Caso não existam mais, gere-os novamente na `saldos_2_0`; isso não precisa recalcular toda a base original.
3. Na aba **Motor de Dados V5** escolha **Salvar cópia protegida**, invente uma frase-senha de no mínimo 12 caracteres e confirme-a.
4. Repita na aba **Conciliação V6** (pode usar a mesma frase-senha, mas cada versão é salva separadamente).
5. Faça logout e login novamente. Escolha **Restaurar cópia protegida** em cada aba e digite sua frase-senha.
6. Após nova importação na planilha, gere os JSON atualizados e substitua a cópia protegida repetindo **Salvar cópia protegida**.

## Limitações e segurança

- **Local, não é banco multiusuário**. O arquivo criptografado fica exclusivamente no navegador/perfil usado para salvá-lo. Não é sincronizado entre computador e celular, nem entre navegadores.
- O navegador pode remover IndexedDB por política de retenção, limpeza de dados, desinstalação ou falta de espaço. Preserve os JSON originais; não use o cofre como único backup.
- Se esquecer a frase-senha, ela **não pode ser recuperada**. Importe novamente o JSON e grave nova cópia.
- Criptografia local reduz a exposição dos dados armazenados, mas **não substitui homologação, controle de origem, ambiente institucional autorizado ou análise de riscos**. Não utilize informações sigilosas no navegador pessoal sem aprovação.
- Os relatórios e frases-senha **não são enviados ao Supabase**. O código é público, mas nunca insira dados institucionais no repositório.
- Uma base persistente compartilhada por setores/dispositivos exigirá uma solução de armazenamento autorizada pela PMMG, com RLS e políticas de retenção, auditabilidade e backups.

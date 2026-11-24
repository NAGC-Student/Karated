# Karateka Reborn

Port em Canvas 2D (HTML, CSS e JavaScript puro) inspirado em **Karateka (1984)**. É uma recriação escolar independente, não um port oficial nem uma cópia dos arquivos originais. Esta versão é o *port base*: o mod (a regra subvertida) será aplicado pelo trio em cima dele.

## Executar localmente
Basta abrir `index.html` no navegador, ou:
```bash
python -m http.server 8000
```
e acessar `http://localhost:8000`. Compatível com GitHub Pages (sem servidor).

## Controles
- `A` `D` (ou `←` `→`): mover (em postura de luta)
- `Espaço`: soco · `F`: chute
- `W` ou `Shift` + direção: correr
- `S` (ou `↓`): agachar — desvia dos socos, mas chutes ainda acertam; agachado não anda nem ataca
- `P` ou `Esc`: pausar/retomar
- `M`: ligar/desligar som
- `T`: tela cheia
- `Enter`: iniciar/reiniciar

Em celulares e tablets aparecem controles de toque abaixo do canvas: setas para mover, **AGACHAR**, **CORRER** (segure) e botões **SOCO**/**CHUTE**.

## Recursos desta versão
- Arte original da fortaleza extraída do disco IBM de 1986, usada na abertura e ao fundo do menu do jogo.
- **Sprites cenográficos originais do disco** (recortados com máscara dos bancos KS*/KSI*): o portão de ferro (KS0), as grades da prisão (KS1), as colunas da galeria (KS3), o vale com árvores e rochas (KS4) e o falcão animado (KSI4).
- Efeitos sonoros procedurais em WebAudio (soco, chute, bloqueio, dano, portão, falcão, vitória) com botão de mudo.
- Pausa, tela cheia, recorde salvo no navegador e pontuação em tempo real.
- Indicador das 12 etapas, aviso justo antes do portão de ferro e animação de queda antes do game over.
- Controles de toque responsivos, foco visível e respeito a `prefers-reduced-motion`.

## O que o port reproduz
Jornada contínua em 12 etapas, um inimigo por vez:
1. **O Penhasco** – primeiro guarda.
2. **O Vale** – vale rochoso com árvores e pedras originais do disco; cuidado com os chutes.
3. **O Pátio Externo** – guarda e o portão de ferro (sprite original) que cai (é preciso correr para passar).
4. **A Muralha** – a fortaleza de 1986 domina o horizonte.
5. **A Galeria** – colunas originais do disco; guardião ágil.
6. **O Pátio Interno** e 7. **O Palácio** – guardas mais ágeis e agressivos.
8. **A Escadaria** e 9. **O Salão Interno** – guardas de elite.
10. **O Falcão** – a ave de Akuma (sprites originais) mergulha do alto; rebata no momento do mergulho (3 rebatidas).
11. **A Sala do Trono** – duelo contra Akuma.
12. **A Prisão** – grades originais; Mariko. Chegue correndo (W ou Shift, sem postura de luta) para resgatá-la; chegar em postura de luta faz ela nocautear você.

Regras do original:
- **Postura de luta x corrida:** correndo não se ataca, e qualquer golpe recebido correndo é fatal.
- **Agachamento:** segure S para desviar dos socos; chutes (mais raros) ainda acertam. Não há mais defesa infinita.
- **Vida regenerativa:** após 3 s sem ser atingido, a vida volta aos poucos (jogador e inimigos).
- **Sem vidas extras:** ao cair, recomeça do penhasco.
- Pontuação por golpes, guardas derrotados e resgate.

## Estrutura
- `index.html` / `style.css`: landing page, HUD e instruções.
- `game.js`: loop `requestAnimationFrame`, máquina de estados (menu, intro, jogando, transição, game over, vitória), combate, IA, falcão, portão e Mariko. As etapas ficam no array `stages`; os cenários novos ficam em `drawBackground` (`vale`, `gallery`) e os sprites originais em `loadOriginal`.
- `assets/sprites/`: quadros PNG com transparência recortados das planilhas NES de referência (herói, guardas, Akuma e Mariko), 44×48 px com os pés alinhados ao chão. Todos já olham para o lado certo (herói à direita; guardas, Akuma e Mariko à esquerda).
- `assets/original/`: arte da fortaleza decodificada de `CASTLE.BCG` (disco IBM), os cenários reconstruídos dos scripts (FUJI, PALACE_*) e os **novos sprites originais** exportados dos bancos `KS*` (gate, prison_bars, falcon_0..5, gallery_column_0..3, vale_*), 4x nearest com transparência; no jogo são tingidos como silhuetas (`loadOriginal`). O relatório técnico completo está em `../../files/REPORT.md`.
- `favicon.svg`: ícone da página (não é asset do jogo original).
- `smoke-test.js`: harness headless (Node + DOM/Canvas/WebAudio stubs) que roda o loop real do jogo e valida 20+ asserções, incluindo um playthrough completo até a vitória.

## Onde aplicar o mod
- Dano, alcance e tempos de ataque: `attack`, `playerAttackCheck` e `enemyThink`.
- Dificuldade por etapa: array `stages` (vida, dano, intervalo e velocidade do inimigo).
- Pontuação: `game.score`.

## Créditos dos sprites
Planilhas NES (Karateka, versão japonesa) usadas como referência escolar.

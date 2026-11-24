# Karateka Reborn

Port em Canvas 2D (HTML, CSS e JavaScript puro) inspirado em **Karateka (1984)**. É uma recriação escolar independente, não um port oficial nem uma cópia dos arquivos originais. Esta versão é o *port base*: o mod (a regra subvertida) será aplicado pelo trio em cima dele.

## Executar localmente
Basta abrir `index.html` no navegador, ou:
```bash
python -m http.server 8000
```
e acessar `http://localhost:8000`. Compatível com GitHub Pages (sem servidor).

## Controles
- `←` `→`: mover (em postura de luta)
- `Espaço`: soco · `X`: chute
- `Shift` + direção: correr
- `↓`: defender
- `P` ou `Esc`: pausar/retomar
- `M`: ligar/desligar som
- `F`: tela cheia
- `Enter`: iniciar/reiniciar

Em celulares e tablets aparecem controles de toque abaixo do canvas: setas para mover, **DEF** para defender, **CORRER** (segure) e botões **SOCO**/**CHUTE**.

## Recursos desta versão
- Arte original da fortaleza extraída do disco IBM de 1986, usada na abertura e ao fundo do menu do jogo.
- Efeitos sonoros procedurais em WebAudio (soco, chute, bloqueio, dano, portão, falcão, vitória) com botão de mudo.
- Pausa, tela cheia, recorde salvo no navegador e pontuação em tempo real.
- Indicador das 7 etapas, aviso justo antes do portão de ferro e animação de queda antes do game over.
- Controles de toque responsivos, foco visível e respeito a `prefers-reduced-motion`.

## O que o port reproduz
Jornada contínua em 7 etapas, um inimigo por vez:
1. **O Penhasco** – primeiro guarda.
2. **O Pátio Externo** – guarda e o portão de ferro que cai (é preciso correr para passar).
3. **O Palácio** e 4. **O Salão Interno** – guardas mais ágeis e agressivos.
5. **O Falcão** – a ave de Akuma mergulha do alto; rebata no momento do mergulho (3 rebatidas).
6. **A Sala do Trono** – duelo contra Akuma.
7. **A Prisão** – Mariko. Chegue correndo (Shift, sem postura de luta) para resgatá-la; chegar em postura de luta faz ela nocautear você.

Regras do original:
- **Postura de luta x corrida:** correndo não se ataca, e qualquer golpe recebido correndo é fatal.
- **Vida regenerativa:** após 3 s sem ser atingido, a vida volta aos poucos (jogador e inimigos).
- **Sem vidas extras:** ao cair, recomeça do penhasco.
- Pontuação por golpes, guardas derrotados e resgate.

## Estrutura
- `index.html` / `style.css`: landing page, HUD e instruções.
- `game.js`: loop `requestAnimationFrame`, máquina de estados (menu, intro, jogando, transição, game over, vitória), combate, IA, falcão, portão e Mariko. As etapas ficam no array `stages`.
- `assets/sprites/`: quadros PNG com transparência recortados das planilhas NES de referência (herói, guardas, Akuma e Mariko), 44×48 px com os pés alinhados ao chão. Todos já olham para o lado certo (herói à direita; guardas, Akuma e Mariko à esquerda).
- `assets/original/CASTLE.png`: arte da fortaleza decodificada de `CASTLE.BCG` do disco original *Karateka – IBM Beta 1986-03-03 (ID 952)*. A extração foi feita com o extrator fornecido e conferida por hash contra a saída de referência; o relatório técnico completo está em `../../files/REPORT.md`.
- `favicon.svg`: ícone da página (não é asset do jogo original).

## Onde aplicar o mod
- Dano, alcance e tempos de ataque: `attack`, `playerAttackCheck` e `enemyThink`.
- Dificuldade por etapa: array `stages` (vida, dano, intervalo e velocidade do inimigo).
- Pontuação: `game.score`.

## Créditos dos sprites
Planilhas NES (Karateka, versão japonesa) usadas como referência escolar.

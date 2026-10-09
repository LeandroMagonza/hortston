# HortSton (web)

Juego de cartas parecido a Hearthstone, pero **sin azar**: en cada turno tenés siempre las mismas tres
cartas, los dos ven todo, y el juego es saber qué tiene el otro y hacer el trade que más te conviene.

**Jugar:** https://leandromagonza.github.io/hortston/ (se publica solo en cada push a `main`, con
`.github/workflows/pages.yml`).

Prototipo en Vite + TypeScript + canvas 2D, con la misma estructura que `GolfKnight/web`: la lógica pura
en `src/core` (con tests), la mesa en canvas en `src/game`, las pantallas (menú, final) en DOM con el
estilo de las de GolfKnight, y las herramientas en `tools/`.

## Correr

```
npm install
npm run dev          # http://localhost:5173
npm test             # core: armas, pelea, turnos, IA
npm run typecheck
npm run sim          # IA contra IA en todas las variantes (-- -v para el registro completo)
npm run matriz       # la matriz de 3×3 de cada turno y con qué probabilidad conviene cada carta
                     # (-- salvajes pradera 4 mago cazador: mazos, hasta qué turno y héroes)
npm run heroes       # cada héroe contra un rival sin héroe (-- todos: además, cada uno contra cada otro)
npm run arte         # dibujos de las cartas con IA (ver abajo)
npm run iconos       # baja los íconos de game-icons.net que falten (ver abajo)
npm run balance      # todos los mazos con todos los héroes, IA contra IA (powerMode=off: sin poder)
```

## Cómo se juega

- **9 turnos de cartas, con mano y maná.** En el turno N te llegan a la mano las 3 cartas de ese turno: 2
  de tu mazo y 1 de la clase de tu héroe (los hechizos son todos de clase). Tenés N de maná y jugás las
  que quieras de tu mano mientras sumen hasta N (cada carta cuesta su turno): la del turno, o varias que
  guardaste. Apenas te llegan, descartás una de las 3 en secreto. Lo que queda se puede jugar después,
  también en las rondas después del T9. Uno ataca en los impares y el otro en los
  pares. (En «Reglas en prueba», la regla de antes: una de las 3 del turno, sin mano.)
- **Elección simultánea:** los dos eligen a la vez, sin ver lo del otro. Contra la IA, tus cartas elegidas
  esperan en el tablero con el borde punteado hasta que elige la IA (que no las mira, ni mira tu mano:
  solo sabe lo que te llegó).
- **Dónde va:** al elegir una carta elegís también su lugar en tu fila: tocás la carta, pasás el mouse
  por tu fila hasta el hueco que querés y hacés click (o ← → y Enter). Algunos efectos dependen de eso:
  «las de los costados», «las de tu izquierda», «las de tu derecha».
- **Resolución:** entran las dos cartas y después se resuelven los efectos, primero el del que ataca:
  el efecto de cada uno le puede apuntar a la carta nueva del otro.
- **Combate:** solo ataca el que ataca ese turno, con cada una de sus cartas. 💤 La que acaba de entrar
  ataca recién el turno siguiente, salvo que tenga **Carga**. Atacar es opcional.
- **La carta:** ⚔️ ataque arriba a la izquierda, ❤ vida arriba a la derecha. En cada pelea los dos se
  pegan a la vez. El daño queda. Algunas cartas tienen 🔱 lanza (pega antes que todo: si mata, el otro
  no pega) o 🔪 cuchillo (pega al final, si sigue viva). El turno de la carta va chico, abajo al medio.
- **La curva es la de Hearthstone:** en el turno N una carta sin efectos reparte 2N+1 (en el T1, 2/1 o
  1/2). Las que tienen efecto pagan con números: la Avispa es 1/1 y al entrar hace 1 de daño, como la
  Arquera élfica. Los hechizos no quedan en la mesa (no suman al golpe final).
- **Efectos chicos:** Al invocar, Último aliento, Fin del turno, Al recibir daño, Guardián, Carga,
  Veneno, Escudo 1, silencio, +1/+1. Salvajes ataca (daño al entrar, Veneno, Carga, golpes a todas);
  Pradera aguanta y crece (crías que crecen, fichas, Guardián, Escudo, refuerzos).
- **Todas las opciones sirven:** en cada turno las tres cartas cumplen papeles distintos (la tabla está
  en `docs/diseno.md`).
- **Curar es ganar vida:** no tiene tope.
- **La vida (30):** como en Hearthstone, tus cartas atacan a una unidad enemiga **o al héroe rival** (su
  retrato con la vida, arriba al medio, detrás de sus cartas), que no devuelve el golpe. El **Guardián**
  lo tapa, y atacar saca el Sigilo. Cada carta elige: cambiar o ir a la cara. Gana el que deja al otro en 0. Después del T9 se sigue peleando sin cartas, con cansancio desde la
  ronda 10 (los dos pierden 1, 2, 3…).
- **Héroes:** cada uno elige un héroe de Hearthstone (menos el Brujo). El **poder** cuesta 1 del maná de
  las cartas y se usa una vez en tu turno de ataque, con lo que no gastaste: o la carta del turno, o una
  más chica y el poder. Hace siempre lo mismo (X = 1, los números de Hearthstone); las cartas de energía
  dan maná para tu turno siguiente. (En el panel, las reglas de antes, con energía aparte: cuesta 2, o
  gasta toda y crece con ella.) El poder está a la derecha de tu fila (tocalo o `P`; si apunta, tocá la carta o el retrato del objetivo). Cada héroe tiene
  además **nueve cartas de clase**, una por turno, con la mecánica de su clase (Congelar, Sigilo, Robo de
  vida, Embestida, auras de los costados mientras la carta está viva…).
- **Sonido:** música y efectos (cada poder tiene el suyo), sintetizados en el navegador. `S` cambia entre
  todo, sin música y nada.
- **Historial** (`H`, o desde el cartel del final): turno por turno, qué jugó cada uno, cada ataque con
  cómo quedaron (tocalo para ver golpe por golpe) y cómo quedó la mesa.

Las cartas del primer prototipo (Manada y Muralla, con arco, triángulo, escudo, armadura y habilidades)
siguen en el código pero fuera del menú: ver `docs/diseno.md`.

| Control | Qué hace |
| --- | --- |
| **Mouse** | elegir carta, elegir objetivo, tocar una unidad tuya y después a quién atacar |
| Mouse encima | la carta se ve en grande a la izquierda, con cada piedra explicada; apuntando a un enemigo, golpe por golpe qué pasa si atacás |
| `1` a `9` | elegir carta de la mano (otra vez la saca; con una unidad, `Enter` la pone donde se muestra) |
| `P` | usar el poder del héroe (si apunta, después tocás el objetivo) |
| `S` | sonido: todo, sin música, nada |
| `←` `→` | correr el lugar donde va la carta elegida |
| `Espacio` | jugar lo elegido (o pasar), o terminar el turno |
| `Esc` / click derecho | soltar la selección; sin selección, el menú |
| `Z` | deshacer (vuelve antes de tu última acción, con la respuesta de la IA incluida) |
| `M` | los mazos de los dos, turno por turno |
| `H` o `L` | el historial de la partida |
| `N` | otra partida igual |

En el menú se elige el rival, los mazos y los héroes, y en «Reglas en prueba» lo que todavía se está decidiendo:
cómo se usa el poder (1 de maná, o con energía aparte: cuesta 2 o gasta toda), cuánto cura el Sacerdote (X+1, 2X o X), cómo se le pega a la vida (atacando al héroe, las que no atacan pegan solas, la diferencia de mesa, o solo al final) y si con el daño o
el nivel, elección simultánea o secuencial, cuántos ataques por turno (todas, 1 o 2), si la carta que entra puede
atacar ese turno, quién ataca primero, quién resuelve primero sus efectos, cuántas rondas sin cartas hay
y la vida inicial (y, para las cartas viejas, reglas del escudo).

## Estructura

```
src/core/      lógica pura, sin DOM: se usa igual desde la pantalla, la IA, el simulador y los tests
  types.ts       tipos del estado, cartas y eventos
  weapons.ts     armas e iniciativa (el ataque simple de los básicos también es un arma)
  cards.ts       cartas y mazos (los números se tocan acá; OLD_DECKS: los del primer prototipo)
  heroes.ts      los héroes: poderes (con su texto según la energía) y cartas de clase
  rules.ts       el motor: turnos, elección, resolución, efectos, combate, poder del héroe, final
  text.ts        el texto de las cartas, generado desde sus datos
  ai.ts          IA: ataques y poder codiciosos, objetivos, minimax de 2 turnos para elegir carta
src/game/      canvas: dibujo de cartas (draw), animaciones (anim), la mesa y los clics (view),
               los dibujos generados (art) y el sonido (sound)
src/menu.ts    pantallas en DOM sobre el canvas: menú, cartel del final, historial, reglas
src/input.ts   mouse y teclado
src/main.ts    une todo; la IA juega de a un paso esperando las animaciones
tools/sim.ts   IA contra IA por consola, con cuántos ataques matan gratis y cuántos son cambios
tools/matriz.ts  la matriz de cada turno y la estrategia mixta óptima de cada jugador
tools/heroes.ts  los héroes contra un rival sin héroe y entre ellos
tools/arte.ts    dibujos con IA (OpenAI); arte-temas.ts dice qué se dibuja en cada carta
tools/iconos.ts  baja los íconos de src/game/iconos.ts a src/game/iconos-svg.json
public/art/    los dibujos generados y su lista (index.json)
docs/diseno.md decisiones de diseño, hallazgos y preguntas abiertas
```

## Dibujos

Por ahora cada carta, héroe y poder lleva un ícono de [game-icons.net](https://game-icons.net) (de Lorc,
Delapouite, Caro Asercion, Cathelineau, DarkZaitzev, Sbed, Skoll y Sparker; licencia
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), con los créditos en «Cómo se juega»). Cuál
lleva cada una está en `src/game/iconos.ts`; si cambiás o sumás uno, `npm run iconos` lo baja y lo guarda
en `src/game/iconos-svg.json`. El juego los pinta del color que quiere (una silueta).

### Con IA

`tools/arte.ts` genera los dibujos de las cartas con la API de imágenes de OpenAI (`gpt-image-2`, el mismo
modelo que el generador de skins de «STS Modded tools», pasado a TypeScript). Necesita la clave en
`web/.env`:

```
OPENAI_API_KEY=sk-...
```

(`.env` está en `.gitignore`.) Los dibujos van a `public/art/<id>.webp` y el juego los usa solos en
lugar del ícono; si no hay, sigue con el ícono.

```
npm run arte -- b_lobo --prueba                    # muestra el pedido, sin llamar a la API
npm run arte -- b_lobo                             # uno, calidad media
npm run arte -- salvajes --estilo public/art/b_lobo.webp   # un mazo entero con el estilo de uno que te gustó
npm run arte -- b_lobo --desde public/art/b_lobo.webp --extra "show the pack" --sufijo _v2   # mejorar uno
npm run arte -- todo --calidad low                 # las 151 (mazos, clases, fichas y retratos de héroes)
```

Grupos: `salvajes`, `pradera`, `clases`, `fichas`, `heroes`, `todo`. Las que ya existen no se rehacen
(`--forzar` para rehacerlas). Qué se dibuja en cada carta está en `tools/arte-temas.ts`.

## Desde la consola

Para probar desde la consola del navegador: `?bot` en la URL hace jugar a la IA de los dos lados, y
`window.__hs` expone el estado (`__hs.game`), la UI, `__hs.start()` y `__hs.pump(ms)`, que adelanta el reloj a mano
(con la pestaña oculta el navegador frena las animaciones).

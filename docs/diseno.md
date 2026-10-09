# HortSton: diseño

6/10/2026 (la vida: las que no atacan le pegan; el modelo de la matriz por turno; héroes con los
poderes de Hearthstone y energía; 2 cartas del mazo y 1 de clase por turno). Lo decidido, lo que mostró el simulador y lo que falta decidir. El prototipo implementa todo lo de "Reglas
actuales"; lo que todavía se está probando se cambia en el panel.

## Pilares

1. **Cero azar del juego.** Ni mazo barajado, ni objetivos al azar, ni daño aleatorio.
2. **Información perfecta de las cartas.** En el turno N cada uno tiene siempre las mismas 3 cartas, y
   los dos ven los 27 de cada uno.
3. **El juego es el trade favorable.** Saber qué tiene el otro y elegir la carta y el ataque que te
   dejan mejor.
4. **Atacar y defender son roles distintos.** Cada mazo se juega distinto según si atacás en los
   impares o en los pares.
5. **Pocas mecánicas, muchas interacciones.** Lo especial (lanza, cuchillo) aparece en pocas cartas.

## Reglas actuales

**Turno de cartas (1 a 9):**
1. Inicio: **llegan a la mano las 3 cartas del turno** (2 del mazo y 1 de la clase) y **cada uno
   descarta una de las 3**, en secreto (8/10, Leandro: al final del turno ya no tenías fresco qué te
   había llegado). El rival sabe qué te llegó y qué jugaste, pero no con cuáles te quedaste. El maná es
   el número del turno (más lo que te dieron las cartas de energía el turno anterior).
2. Elección: cada uno juega de su mano **las que sumen hasta el maná** (el número del turno; cada carta
   cuesta su turno), o nada. **Simultánea** por defecto (los dos a ciegas). En el panel se puede pasar a
   secuencial (el atacante elige a la vista, el defensor responde). Con cada unidad se elige **dónde va
   en tu fila**: entre dos de las tuyas o en una punta.
3. Resolución: **entran todas las cartas y después se resuelven los efectos** («Al invocar» y
   hechizos), primero los del que ataca (o los de quien juegue algo Rápido), en el orden en que se
   eligieron. Así el efecto de cada uno le puede apuntar a una carta que acaba de jugar el otro.
4. Combate: solo ataca el atacante, con cada una de sus cartas, **a una unidad enemiga o al héroe
   rival** (su retrato, detrás de sus cartas). **La que acaba de entrar no ataca ese
   turno** (💤), salvo con **Carga**. En el panel: limitar a 1 o 2 ataques, o sacar la espera. En su
   combate, el atacante puede usar además **el poder de su héroe** (ver «Héroes»).
5. Después del T9 no llegan más, pero lo que quedó en la mano se puede jugar (maná 9). En el panel: la
   regla de antes, una de las 3 del turno y sin mano.

**La vida (30):** como en Hearthstone, **una carta que ataca al héroe rival le pega su daño a la
vida**; el héroe no devuelve el golpe. Si el rival tiene un **Guardián**, hay que sacarlo primero (con
Sigilo no tapa). Con **Embestida**, el turno en que entra solo ataca unidades; con **Carga**, también al
héroe. Atacar al héroe **saca el Sigilo**, como cualquier ataque (8/10, Leandro: con las que no atacan
pegándole solas a la vida, una carta con Sigilo pegaba todos los turnos sin dejarse ver nunca, y no
había respuesta). O sea: cada carta elige entre cambiar o ir a la cara. Gana el que deja al otro en 0. Después del T9 no hay más cartas y se sigue
peleando; desde la ronda 10, **cansancio**: los dos pierden 1, después 2, 3… (así no hay un «último
ataque» fijo). En el panel: la regla de antes (al terminar tu turno de ataque, las que no atacaron le
pegan solas a la vida, salvo Guardián), pegar con el **nivel** en vez del daño (los dos lobitos de nivel
1 pegan 2; la Rata, 1), o la variante **B**: al final de cada turno, el que tiene menos en la mesa pierde
la diferencia; o la regla vieja (solo al final, cada carta viva pega su nivel).

**Las cartas:** ⚔️ ataque y ❤ vida. En cada pelea los dos se pegan a la vez, como en Hearthstone: el que
ataca también recibe. El daño queda. Algunas cartas tienen además 🔱 **lanza** (pega antes que todo: si
mata, el otro no llega a pegar) o 🔪 **cuchillo** (pega al final, solo si la carta sigue viva).

**La curva es la de Hearthstone:** en el turno N una carta sin efectos reparte **2N+1** (en el T1, 2/1
y 1/2; a veces 3/1 o 1/3). Las que tienen efecto pagan con números (la Avispa es 1/1 y al entrar hace 1
de daño, como la Arquera élfica). La lanza cuesta 1 y el cuchillo da 1. Los **hechizos** no quedan en la
mesa, así que no suman al golpe final: se cambian puntos del final por un efecto ahora.

**Efectos (chicos):** Al invocar (daño a una, daño a una y a las de sus costados, daño a todas las
enemigas, +1/+1 a otra, Escudo a otra,
silenciar, invocar una ficha), Último aliento (invoca fichas), **Fin del turno** (al terminar cada turno,
haya peleado o no: crecer, poner un huevo, curar), **Al recibir daño** (se enoja: gana ataque para la
próxima), Guardián, Carga, **Veneno** (si le hace daño, la mata; el Escudo lo frena), Escudo 1 (el primer
golpe se pierde, como el escudo divino). Hechizos: daño a una, daño a todas las enemigas, +N/+N a las
tuyas. Ningún efecto le pega a tus propias cartas.

**Efectos de posición** (al jugarse): «las de los costados» son las dos de al lado; «las de tu
izquierda» y «las de tu derecha», todas las de ese lado. Las fichas de un Último aliento salen donde
estaba la que murió; las que invoca una carta (al entrar o al final del turno), a su derecha.

**Regla de diseño: todas las opciones tienen que servir.** En cada turno, las opciones cumplen papeles
distintos, así ninguna es «la misma con más números» (hay un test que lo controla para las cartas sin
efectos). Y cada efecto tiene con qué contestarlo.

**Mazos (2 cartas por turno, solo unidades):** iguales para cualquier héroe. Los hechizos y las cartas
más propias de cada estilo pasaron a las clases (la Avispa al Cazador, el Ternero al Druida, el Incendio
al Mago…). La Hiena, el Gallo, el Granizo, el Ciervo y el Toro quedaron fuera.

| T | Salvajes | Pradera |
|---|---|---|
| 1 | 🐺 **Lobezno** ⚔️1 ❤1: Al invocar: invoca un Cachorro (⚔️1 ❤1) · 🐀 **Rata** ⚔️2 ❤1: Último aliento: ganás 1 de energía | 🐤 **Pollito** ⚔️1 ❤1: Último aliento: invoca un Pichón (⚔️1 ❤1) · 🐰 **Conejo** ⚔️1 ❤3 |
| 2 | 🦂 **Escorpión** ⚔️1 ❤2: Veneno · 🐗 **Jabalí** ⚔️2 ❤2: Carga | 🐕 **Perro** ⚔️2 ❤2: Al invocar: ganás 1 de energía · 🐑 **Cordero** ⚔️2 ❤1 |
| 3 | 🦇 **Murciélago** ⚔️2 ❤1: Al invocar: 1 de daño a todas las unidades enemigas · 🦜 **Loro** ⚔️3 ❤2: Al invocar: silencia a una unidad enemiga | 🦃 **Pavo** ⚔️2 ❤3: Mientras esté viva: las de los costados tienen +1 de vida · 🐏 **Carnero** ⚔️3 ❤3: Guardián |
| 4 | 🐺 **Lobo Alfa** ⚔️3 ❤4: Mientras esté viva: las de los costados tienen +1 de daño · 🐊 **Cocodrilo** ⚔️5 ❤4 | 🐐 **Cabra** 🔱3 ⚔️2 ❤3 · 🐔 **Gallina** ⚔️2 ❤3: Fin del turno: invoca un Pichón (⚔️1 ❤1) |
| 5 | 🐆 **Leopardo** ⚔️4 🔪3 ❤5 · 🐺 **Lobo** ⚔️5 ❤4: Carga | 🐴 **Caballo** ⚔️6 ❤5 · 🦉 **Búho** ⚔️4 ❤4: Al invocar: las de tu izquierda: +1 de vida y las de tu derecha: +1 de daño |
| 6 | 🐅 **Tigre** ⚔️7 ❤6 · 🦍 **Gorila** ⚔️5 ❤5: Al invocar: tus otras unidades: +1 de daño | 🐃 **Búfalo** ⚔️6 ❤7 · 🐻 **Osa** ⚔️4 ❤5: Último aliento: invoca 2 Oseznos (⚔️2 ❤2) |
| 7 | 🦁 **León** ⚔️8 ❤7 · 🦏 **Rinoceronte** 🔱4 ⚔️4 ❤6 | 🐫 **Camello** ⚔️7 ❤8 · 🐘 **Gran Elefante** ⚔️5 ❤9: Guardián |
| 8 | 🦈 **Tiburón** ⚔️9 ❤8 · 🐘 **Elefante** ⚔️6 ❤8: Al invocar: 2 de daño a una unidad enemiga y a las de sus costados | 🦛 **Hipopótamo** ⚔️8 ❤9 · 🦘 **Canguro** ⚔️6 ❤6: Al invocar: tus otras unidades: +1/+1 |
| 9 | 🦖 **T-Rex** ⚔️10 ❤9 · 🐉 **Dragón** ⚔️7 ❤7: Al invocar: 2 de daño a todas las unidades enemigas | 🐘 **Mamut** ⚔️9 ❤10 · 🦅 **Grifo** 🔱4 ⚔️5 ❤9 |

**Auras («mientras esté viva»):** el Lobo Alfa (+1 de daño), el Pavo (+1 de vida), el Tótem lengua de
fuego del Chamán (+2 de daño) y la Guardiana de la luz del Paladín (+1 de vida) les dan el bonus a las de
sus costados mientras están vivos y al lado: matar a la del medio se los saca. Al perder un aura de vida
pierde esa vida aunque esté herida, pero no se muere por eso (queda en 1). Hearthstone solo la baja hasta
la vida máxima, y probándolo (7/10, Leandro) eso se veía raro: un Pavo al lado de una herida (por el
Murciélago) la curaba para siempre.

**Curar es ganar vida:** no tiene tope (puede pasar de la vida de la carta).

### Lo que el motor sabe hacer y hoy no usa ningún mazo

Las cartas del primer prototipo (Manada y Muralla, fuera del menú, en `cards.ts` como `OLD_DECKS`)
siguen funcionando y tienen tests:

- 🏹 **Arco:** ataca solo con el arco, de lejos; solo le responde otro arquero. Sus otras armas son para
  defenderse.
- **Triángulo:** 🗡️ espada > 🪓 hacha > 🔨 maza > 🗡️ espada, en el lugar del ataque: el que gana pega
  primero. Se sacó de los mazos porque premiaba tener justo el counter más que hacer un buen cambio.
- **Escudo N:** frena los golpes menores que N; uno de N o más lo rompe y ese golpe se pierde (Escudo 1
  es el escudo divino). **Armadura N:** resta N a cada golpe. Se cruzan: la armadura aguanta muchos
  golpes chicos y pierde contra uno grande; el escudo, al revés.
- **Hechizos**, **habilidades** («Palabra clave: efecto»: Al invocar, Antes y Después de pelear, Tras el
  combate, Último aliento, Caer en combate, Aguante, Guardián, Rápido, Energía N, Evoluciona), objetivos
  a elección, silencio, desterrar, buffs.

## Decisiones y por qué

- **Atacar al héroe a mano, como en Hearthstone** (8/10, Leandro). Antes, las que no atacaban le pegaban
  solas a la vida al terminar el turno: una carta con Sigilo pegaba todos los turnos sin perderlo, y el
  Sigilo no tenía respuesta. Ahora ir a la cara es un ataque: saca el Sigilo, el Guardián lo tapa y la
  Embestida no puede el turno en que entra. En la pantalla el héroe rival (retrato y vida) está detrás de
  sus cartas, arriba al medio, y se lo toca como a una unidad; el tuyo, al lado de tu mano. La regla de
  antes queda en el panel.
- **El Pícaro, Sigilo y cuchillos** (8/10, Leandro). Sus unidades tienen cuchillo (pega último: peleando,
  recibe el golpe antes de dar el suyo; a la cara pega entero) y casi todas Sigilo: eligen cuándo atacar
  y pegan a la cara; cuando atacan, se ven. Sus números quedaron cerca de la curva (el cuchillo da 1, el
  Sigilo cuesta 1): antes le faltaban 23 en total y la IA no jugaba nunca la Maestra de dagas ni la Sombra.

- **Héroes con los poderes de Hearthstone y energía** (6/10, Leandro). Un poder por clase (menos el
  Brujo). Lo que va a un solo lado hace X+1 en vez del doble de Hearthstone.
- **Mano y maná, con descarte secreto** (8/10, Leandro). Cada turno llegan las 3 cartas del turno; el
  maná es el número del turno y se juega lo que sume hasta eso, así que una carta buena que no era para
  ese momento se juega después, y aparecen los combos (dos chicas en vez de una grande). Apenas llegan,
  descartás una de las 3 en secreto: es información oculta sin azar (el rival sabe qué te llegó,
  no qué guardaste). La IA mira las jugadas que mejor dejan la mesa (5 por lado) y solo este turno, y
  de la mano del rival supone todo lo que le llegó y no jugó. La regla de antes queda en el panel.
- **2 del mazo + 1 de clase por turno, y los hechizos solo de clase** (6/10, Leandro). Los mazos
  quedaron en 2 unidades por turno; cada clase tiene 9 cartas (una por turno), unidades y hechizos, con
  su mecánica. Los mazos son lo que comparten todos; la clase, lo que distingue.
- **Auras de los costados mientras la carta está viva** (6/10, Leandro): «al invocar» se queda para
  siempre; un aura se pierde si matás a la del medio, y eso hace que la posición importe en cada ataque.
- **El poder cuesta 2, sin límite por turno, y no crece** (6/10, Leandro). La primera versión gastaba
  toda la energía y crecía con ella; el «con 2 de energía» se leía como costo, y además el poder escalaba
  con la partida. Ahora cuesta 2 y hace siempre lo mismo; la decisión entre turnos es guardar energía
  para usarlo dos veces, y algunas cartas dan energía al jugarlas o al morir (la Rata y el Perro, que
  antes no se elegían nunca, pasaron a ser las de energía). La versión que gasta toda queda en el panel.

- **La vida: las que no atacan le pegan (C)** (6/10, Leandro). Antes la vida solo cambiaba al final, con
  una ronda extra que le daba un ataque sin respuesta a uno de los dos. Se compararon tres ideas:
  (A) cada turno, cada uno recibe lo que suma la mesa del otro; (B) cada turno, solo la diferencia; (C)
  las cartas que no atacan le pegan a la vida. A y B hacen que cada turno cuente, pero no agregan
  decisiones, y si nadie llega a 0 eligen siempre al mismo ganador (B es A con números chicos). C agrega
  la decisión central de Hearthstone en cada ataque, ¿cambio o cara?, y le da sentido al Guardián. B
  queda en el panel para comparar, y también pegar con el nivel en vez del daño. Las mesas se dan
  vuelta: una carta que saca más valor (un golpe a todas, un buen cambio) permite volver desde atrás.
- **Ningún efecto le pega a tus propias cartas** (6/10, Leandro). El Murciélago, el Incendio y el
  Elefante le pegaban a todas, también a las tuyas, y no se veían buenos momentos para jugarlos. Ahora
  le pegan solo a las enemigas, y el Elefante a una y a las de sus costados: la posición también
  importa para defenderse (separar a las importantes).
- **Efectos chicos a la Hearthstone, curva 2N+1 y la recién llegada no ataca** (6/10, Leandro). El
  dinamismo tiene que venir de efectos que den vuelta una mesa: si hiciste buenos cambios y te quedaron
  tres cartas con 1 de vida, un hechizo o un bicho chico que pega 1 a todas te las limpia. Con la curva
  de Hearthstone la carta nueva vuelve a ser más fuerte que las viejas, y por eso la recién llegada no
  ataca ese turno (salvo Carga): sin esa espera, con todas atacando, la mesa se vaciaba y 6 de 8
  partidas del simulador terminaban empatadas; con la espera, 2 de 8 o ninguna, y más cambios. Además
  separa roles: lo que jugás cuando atacás espera dos turnos para pegar; lo que jugás cuando defendés,
  uno, pero recibe un ataque antes.
- **Todas las opciones tienen que servir** (6/10, Leandro). El Pollito 1/2 al lado del Conejo 1/3, o el
  Lobezno 2/1 al lado de la Rata 3/1, no se elegían nunca. Ahora cada turno tiene tres papeles distintos,
  y aparecieron tres mecánicas chicas para eso: Fin del turno (el Ternero que crece, la Gallina que pone
  huevos), Al recibir daño (la Hiena que se enoja) y Veneno. Con eso los cambios subieron del 27% al 46%
  de los ataques.
- **Elegir dónde va la carta** (6/10, Leandro). Una decisión más en cada jugada sin reglas nuevas, y abre
  efectos de posición como los de Hearthstone (Lobo alfa, Defensor de Argus). Por ahora los efectos de
  posición son al jugarse, no permanentes (un aura obliga a recalcular todo cada vez que algo se mueve
  o muere). En la pantalla: tocás la carta, mostrás dónde va pasando el mouse por tu fila y hacés click
  (o ← → y Enter). La IA prueba cada lugar si la carta tiene un efecto de posición; si no, la pone a la
  derecha.
- **Entran las dos y después los efectos** (6/10). Antes la carta que se resolvía primero no podía
  apuntarle a la del otro, y en el T1 el efecto del que ataca no tenía a quién pegarle.
- **Un solo ataque por turno, descartado** (6/10, Leandro: no le gustó). Queda en el panel.
- **Curva chata (N+5)** (6/10, después de la primera partida de Leandro; reemplazada por la de arriba). Con la
  curva 2N+2 la carta nueva le ganaba siempre a las viejas y podía atacar apenas entraba: el que atacaba
  mataba con sus dos últimas cartas las dos más viejas del otro sin perder nada, y en el turno siguiente
  el otro hacía lo mismo. Elegir la de más vida alcanzaba. El simulador lo confirmó: 92% de los ataques
  mataban sin perder la carta, y ni «la recién llegada no ataca» ni limitar ataques lo arreglaban
  (seguía arriba del 80%). Lo que lo cambia es la curva: con N+5 las viejas siguen sirviendo para
  cambiar. Pero si atacan todas, la mesa se vacía y las partidas terminan 30 a 30; con un ataque por
  turno la mesa llega llena al final (4 o 5 cartas por lado) y se decide por pocos puntos.
- **Una sola versión, con lanza y cuchillo como algo de pocas cartas** (6/10, Leandro). Primero se
  probaron mazos «básicos» sin nada especial al lado de los «con armas»; Leandro prefirió una sola
  versión donde la lanza y el cuchillo existan pero se usen poco (5 o 6 cartas de 27 por mazo).
- **Sin el triángulo** (6/10, Leandro). Con «el que gana pega primero» muchas peleas terminaban con uno
  que mataba sin recibir nada, y pesaba más tener justo el counter que hacer un buen cambio.
- **Elección simultánea por defecto** (6/10, Leandro). En secuencial el defensor siempre ve la carta del
  atacante, y como no hay azar las partidas arrancaban siempre igual: vos jugás la tortuga, yo la que
  la counterea. A ciegas, cada turno es un pequeño juego de adivinar sobre opciones que los dos conocen.
  Contra la IA ves tu carta elegida en el tablero mientras la IA elige (no la mira).
- **Curar sin tope** (6/10, Leandro). Curar y ganar vida son lo mismo; así no hace falta llevar la cuenta
  de un máximo.
- **Historial de la partida** (6/10, Leandro). Turno por turno: qué jugó cada uno, cada ataque con cómo
  quedaron (y golpe por golpe al tocarlo), y cómo quedó la mesa. Con H o desde el cartel del final.
- **Ataque manual del atacante.** Con combate automático las únicas decisiones serían 9 veces "1 de 3".
- **La carta muestra solo lo que tiene.** Las armas a la izquierda en el orden en que pegan (la lanza
  arriba, el cuchillo abajo), la vida a la derecha. Sin huecos: casi todas tienen solo el ataque, y así
  queda arriba frente al corazón.
- Del primer prototipo, y siguen valiendo si vuelven esas mecánicas: el arco solo ataca con el arco y
  sus otras armas son para defender; el golpe que rompe el escudo se pierde (si no, el escudo nunca es
  mejor que una armadura del mismo valor); la regeneración del escudo va en las cartas; los objetivos a
  elección se eligen al resolver la carta, sin fases nuevas.

## Hallazgos del simulador

`npm run sim` (IA contra IA; sin azar, una partida por combinación alcanza). Además del resultado,
cuenta cómo terminan los ataques: «gratis» (el que ataca mata y sobrevive), «cambio» (mueren los dos),
«no muere nadie».

**Cartas de clase emparejadas (8/10, `npm run balance -- --cartas`):** el objetivo de Leandro es que entre
un tercio y la mitad de lo que se juega sean cartas de clase, y que se elijan por la situación, no porque
sean mejores. La medida: de las que le llegan, cuántas descarta de cada tipo (si las de clase casi nunca
se descartan, son mejores; si siempre, no sirven) y, carta por carta, cuáles no se juegan nunca. Antes de
medir hubo que arreglar a la IA, que descartaba con un valor fijo sin mirar los efectos: ahora prueba
cada carta nueva jugada sola (con sus efectos, el mejor objetivo y, si ataca, su ataque), ahora y contra
la unidad más grande que el rival puede jugar el turno siguiente (lo que tiene en la mano y lo que le
llega, que se ve), así una remoción se guarda para la amenaza. Quedó: **el 42 % de las cartas jugadas
son de clase (44 % del maná)**, cada héroe entre 36 % (Guerrero) y 53 % (Pícaro), y las de clase se
descartan casi como las del mazo (un 24–34 % contra un 32–38 %; el Pícaro, 5 %: sus unidades se juegan
siempre). Solo la Avispa y la Cobra se juegan poco. Héroes, de 72: Paladín 51, Caballero de la muerte 50,
Druida 40, Chamán 37½, Mago 36, Sacerdote 33½, Pícaro 31, Cazador de demonios 31, Cazador 26, Guerrero
24 (antes de emparejar, de 14 a 61). Ojo: con la IA sin azar, un cambio chico da vuelta muchas partidas;
entre corridas un héroe se mueve ±10.

Lo que cambió: las que no se jugaban nunca subieron (Rayo de escarcha 4 de daño, Incendio 3 a todas,
Meteoro 5; Leona 4/5, Perro de caza 2/1, Quimera 7/8; Vaca sagrada 6/8, Sanadora
4/5, Clériga 2/3; Herrera 2/5, Grito infernal 6/10 con +4, Coloso 9/10; Bendición de reyes +4/+4,
Llamado a las armas 3 Reclutas y +1/+1 a todas, Unicornio 7/8, Señor de la luz 7/8, Caballero argénteo
5/5; Puñalada 4, Cobra 4/7; Descarga de escarcha 3, Cadena de relámpagos 3, Tormenta 4, Lobos
espectrales 3/3; Primavera +2/+2, Estampida +3/+3, Treants 3/2 que quedan, Ent joven 4/5; Exhumadora 3/4,
Abominación 4/4, Golpe de escarcha 3, Gigante de hueso 7/8; Avispa 1/2, Elemental de agua 4/6, Archimaga
6/8). Las que se jugaban siempre en los que ganaban de más bajaron (Cazador de almas 3/3, Mastín vil 4/4,
Demonio del abismo 6/7, Señor demoníaco 7/7, Gran cazador 7/8; Rey de la escarcha 6/8, Dragona de hueso
7/8). Tres cambiaron de efecto para ser tácticas: **Ejecutar** destruye a una herida y a una sana le hace 3
(antes, sin heridas no servía); **Control mental** solo a una herida (hay que prepararlo); el **Espíritu
divino** es una unidad 2/4 que al entrar duplica la vida de otra tuya. El Pícaro: ataque y cuchillo
(⚔️ y 🔪, con cuchillo solo perdía todas las peleas) y su Sigilo ya no cuesta vida.

**Atacando al héroe a mano, con el Pícaro nuevo (8/10, `npm run balance`):** asiento J1 46 %;
Salvajes gana el 65 % contra Pradera con cualquier héroe. Héroes, de 72: Caballero de la muerte 57,
Cazador de demonios 47, Druida 44, Sacerdote 38, Mago 34, Chamán 34, Paladín 33, Cazador 30, Pícaro 22
(antes 12), Guerrero 21. La IA tuvo que aprender dos cosas: las Garras se miden junto con el ataque que
sigue (si no, atacaba primero y el poder ya no servía) y el Sigilo vale más cuanto más pega la carta.
**Cartas de clase contra las del mazo** (objetivo de Leandro: entre un tercio y la mitad de lo que se
juega, y que sean tácticas, no mejores): en total, el 40 % de las cartas jugadas (y del maná). Por héroe
cambia mucho. Si las de clase casi no se descartan, es que son mejores: Caballero de la muerte (50 % de
lo jugado; descarta el 6 % de las de clase y el 47 % de las del mazo), Pícaro (57 %; 6 contra 47),
Cazador de demonios (49 %; 17 contra 41) y Paladín (43 %; 16 contra 41). Parejas, como se busca:
Sacerdote (35 %; 33 contra 33), Mago (37 %; 34 contra 33), Druida (36 %; 28 contra 36). Peores que las
del mazo: Cazador (26 %; descarta el 54 % de las suyas), Chamán (30 %; 44 %) y Guerrero (32 %; 38 %). El
Pícaro juega sobre todo cartas de clase y aun así pierde: el cuchillo pega último, y cuando una de las
suyas ya atacó (y se ve), la sacan antes de que pegue.

**Con mano y el poder que cuesta 1 de maná, una vez por ataque (8/10, `npm run balance`):** el
asiento queda parejo (J1 48 %), pero Salvajes gana el 63 % contra Pradera con cualquier héroe (sin
héroes, Pradera le gana en los dos asientos). Héroes, de 72, y cuántas veces usan el poder por partida
(atacan 5 o 6 veces): Caballero de la muerte 54 (2,8), Cazador de demonios 49½ (1,3), Paladín 47 (2,6),
Druida 41½ (2,5), Chamán 41 (2,6), Sacerdote 34 (3,9), Mago 33 (3,7), Cazador 33 (2,4), Guerrero 15
(2,5), Pícaro 12 (1,8). Ninguno lo usa siempre: compite con las cartas.

**Con mano y maná (8/10, `npm run balance`, poder que cuesta 2):** los mazos quedan parejos (Salvajes
gana el 51 % contra Pradera, antes 55 %) y el asiento también (J1 48 %). Héroes, de 72: Sacerdote 54½,
Cazador de demonios 46, Caballero de la muerte 45, Mago 42½, Chamán 40½, Paladín 38, Cazador 36, Druida
33, Guerrero 13½, Pícaro 11. El Guerrero y el Pícaro siguen muy abajo por sus cartas.

**Mazos y héroes, con y sin poder, sin mano (8/10, `npm run balance`):** todas las combinaciones mazo + héroe
contra todas, en los dos asientos (400 partidas). Sin héroes, Salvajes le gana a Pradera en los dos
asientos (14 a −1 atacando primero, 5 a 0 atacando segundo); con cualquier héroe, Salvajes gana el 59 %
sin poder y el 55 % con poder. El asiento está parejo sin poder (J1 51 %); con el poder que cuesta 2, J2
gana más (J1 44 %). Partidas ganadas de 72 (contra los otros 9 héroes, con el mismo mazo y cruzados):

| Héroe | Sin poder (solo cartas de clase) | Poder cuesta 2 | Poder gasta toda |
|---|---|---|---|
| Sacerdote | 54 | 61 | 61½ |
| Cazador de demonios | 50 | 29 | 33 |
| Paladín | 49 | 50 | 48 |
| Caballero de la muerte | 44 | 44 | 48 |
| Chamán | 39 | 40 | 36 |
| Cazador | 33 | 35½ | 31½ |
| Mago | 31 | 48½ | 48 |
| Guerrero | 28 | 14 | 15 |
| Druida | 25 | 28 | 32 |
| Pícaro | 7 | 10 | 7 |

El total es fijo (360): si un héroe baja con el poder, su poder vale menos que el de los demás. El del
Mago es el que más suma (+17½); los del Cazador de demonios y el Guerrero, los que menos. Lo fuerte del
Paladín son sus cartas de clase, no el poder. Pero la IA usa el poder apenas llega a 2 de energía,
también con «gasta toda» (X = 2 o 3): no mide lo que hace una persona que junta energía para un Recluta
6/6, que además le pega a la vida cada turno que no ataca. El Pícaro está mal por sus cartas.

**Héroes con sus nueve cartas de clase (6/10, `npm run heroes -- todos`):** partidas ganadas de 36
(cada uno contra los otros 9, mismos mazos de los dos lados, los dos asientos):

| 📿 Sacerdote | ⚜️ Paladín | 💀 Cab. muerte | 🔮 Mago | 🌩️ Chamán | 🏹 Cazador | 🌿 Druida | 👿 Caz. demonios | 🎭 Pícaro | 💪 Guerrero |
|---|---|---|---|---|---|---|---|---|---|
| 29 | 26 | 24 | 22½ | 19 | 17½ | 16 | 15 | 6 | 5 |

El Guerrero y el Pícaro quedaron muy abajo: sus cartas de los primeros turnos son flojas (Berserker 1/2,
Ejecutar y Puñalada dependen de que haya una herida o una sana) y el Sigilo la IA lo aprovecha poco (el
Pícaro jugó 1,3 cartas de clase por partida; los demás, 3 a 5). Es lo próximo para ajustar.

Antes de las cartas de clase (una sola carta de clase por héroe, como cuarta opción), con el poder que
cuesta 2 y el Sacerdote curando X+1:

| 🔮 Mago | 💀 Cab. muerte | ⚜️ Paladín | 🌿 Druida | 🎭 Pícaro | 🏹 Cazador | 💪 Guerrero | 📿 Sacerdote | 🌩️ Chamán | 👿 Caz. demonios |
|---|---|---|---|---|---|---|---|---|---|
| 28 | 25 | 20 | 20 | 18 | 17 | 17 | 16½ | 11 | 7½ |

Con la primera versión (gasta toda la energía, Sacerdote curando X): Mago, Pícaro y Druida 24, Caballero
de la muerte 23, Cazador 22, Paladín 19, Chamán 15, Guerrero 14, Cazador de demonios 8, Sacerdote 7. El
Sacerdote solo (`npm run heroes -- sacerdote priestHeal=…`), en esa versión: 7 curando X, 12 curando X+1,
18 curando 2X.

Los que sacan unidades o pegan están arriba; las Garras (que duran un turno) y los tótems, abajo. En una
carrera a 0, 1 de vida ganada vale menos que 1 de daño. La IA casi no juega las cartas de clase (0 a 3 de
4 partidas), pero eso puede ser de la IA.

**Con la vida nueva (6/10):**

1. **Las partidas terminan entre el turno 7 y el 13**, casi siempre con alguien en 0 (un ritmo parecido
   al de Hearthstone).
2. **Salvajes le gana a Pradera** en los dos órdenes: en una carrera, el mazo agresivo tiene ventaja, y
   la matriz (abajo) muestra que J1 Salvajes gana todas las combinaciones de los primeros turnos. Pradera
   necesita con qué frenar (más Guardián, curar la vida, castigar al que va a la cara) o la IA juega mal
   el plan de aguantar.
3. **La IA cambia poco y va mucho a la cara** (unos 6 ataques a cartas por partida). Puede ser lo
   correcto con estos mazos o una falla de la IA; hay que verlo jugando.

**Antes, con la vida solo al final:** 46% de los ataques eran cambios, y el que atacaba último ganaba el
espejo.

**Antes de los efectos (curva N+5, sin efectos):** con un ataque por turno la IA siempre mataba sin
perder la suya (siempre hay una presa débil); con todas atacando la mesa se vaciaba y empataban.

**Primer prototipo (Manada y Muralla):** el que ataca último ganaba mucho, y Muralla le ganaba a Manada
en todas las variantes (Guardián + Lanza + Armadura).

## El modelo: cada turno es una matriz de 3×3

Como no hay azar y los dos ven todo, cada turno de cartas es un juego simultáneo chico: J1 elige una de
3 filas, J2 una de 3 columnas, y la casilla dice cómo termina la partida si después los dos juegan bien.
Eso es un juego de suma cero, y tiene una solución exacta: una **estrategia mixta** para cada uno (con
qué probabilidad conviene elegir cada carta) que es la mejor posible si el otro también juega bien.

`npm run matriz -- salvajes pradera 4` arma esas tablas para los primeros turnos: para cada par de
cartas juega el resto de la partida con la IA y anota el resultado para J1 (diferencia de vida, ±100 por
ganar), y después calcula la estrategia mixta de cada uno. Una carta con 0% es una carta que en esa
posición nunca conviene. El objetivo de diseño es que **las tres tengan peso en cada turno**.

Primer resultado (Salvajes J1 contra Pradera J2, vida nueva):

| Turno | J1 Salvajes juega | J2 Pradera juega |
|---|---|---|
| 1 | Avispa 26% · Lobezno 74% · Rata 0% | Pollito 0% · Conejo 84% · Ternero 16% |
| 2 | Escorpión 60% · Jabalí 0% · Zarpazo 40% | Perro 0% · Cordero 100% · Gallo 0% |
| 3 | Murciélago 38% · Hiena 0% · Loro 62% | Pavo 54% · Carnero 0% · Granizo 46% |

Límites: la tabla depende de la mesa con la que se llega a ese turno (se sigue la partida que juega la
IA) y de lo bien que juega la IA. Sirve para encontrar cartas que sobran, no como verdad final.

**Cómo hacer que haya decisiones que crucen turnos** (que el mejor cambio de hoy te pueda costar algo
mejor mañana):
- Cartas que valen más si sobreviven (el Ternero que crece, Evoluciona en TN): usarlas para cambiar hoy
  es perder lo que iban a ser.
- Premios por no pelear: «Fin del turno: si no atacó, +1/+1» choca con ir a la cara y con cambiar.
- Cartas que usan a las tuyas: «Al invocar: comé una tuya y ganá su vida» o «+1/+1 por cada tuya»: un
  cambio que te deja con menos cartas te hace peor la del turno siguiente (y vos sabés cuál viene).
- Efectos de posición: matar la carta del medio deja sin vecinos a las de los costados para el buff
  que venía.
- El poder del héroe cargado con algo (ver abajo): cambiar, ir a la cara o dejar morir a las tuyas
  carga distintas cosas.

## Héroes

**Implementado (6/10, idea de Leandro):** cada jugador elige un héroe, con el poder de su clase en
Hearthstone (menos el Brujo: su poder roba cartas y acá no hay mazo). El poder se usa con **energía**:

- **El poder cuesta 1 del maná de las cartas** y se usa **una vez en tu turno de ataque** (8/10,
  Leandro). Con energía aparte, el poder era gratis comparado con las cartas y siempre convenía usarlo
  (el del Cazador, sobre todo: daño a la cara sin pensar); compartiendo el maná es una decisión, como en
  Hearthstone: la carta del turno, o una más chica y el poder. **Hace siempre lo mismo**: X es 1, los
  números de Hearthstone (más lo que sumen cartas como el Aprendiz).
- Las cartas «de energía» (la Rata y el Perro en los mazos; la Dríade, el Ent joven, el Ancestro, el
  Sabueso, la Exhumadora, Muerte y descomposición y el Tótem del Viento en las clases) dan **maná para
  tu turno siguiente**: el Druida acelera.
- En el panel quedan las reglas de antes, con **energía aparte** que se junta 1 por turno (hasta 10): el
  poder cuesta 2, las veces que te alcance, con X = 2; o **gasta toda la energía** y X es lo que gastaste.
- Lo que va a un solo lado hace 1 más: el Cazador (solo a la vida del rival) y el Guerrero (solo a la
  tuya). En Hearthstone serían el doble; con +1 queda más parejo. Curar también hace X+1: con X, el
  Sacerdote era el más flojo (7 de 36). 2X (lo de Hearthstone) queda en el panel para comparar.

| Héroe | Poder (X = energía) | Primera carta de clase (antes era la única) |
|---|---|---|
| 🔮 Mago | 🔥 Explosión de fuego: X de daño a una enemiga o al rival | T2 🧙 Aprendiz 2/2: **Poder +1** (daño de hechizo) |
| 🏹 Cazador | 🎯 Disparo firme: el rival pierde X+1, aunque tenga Guardián | T2 🦮 Sabueso 2/2: al pegarle al rival, ganás 1 de energía (ir a la cara) |
| 📿 Sacerdote | ✨ Curación menor: +X+1 de vida a una tuya o a vos (en el panel: 2X o X) | T2 🕯️ Clériga 1/3: al usar tu poder, tus otras +1 de vida |
| 💪 Guerrero | 🛡️ ¡Armadura!: ganás X+1 de vida | T3 ⚒️ Herrera 1/5, Guardián: al recibir daño, ganás 2 de vida (armadura) |
| ⚜️ Paladín | 📯 Refuerzos: un Recluta X/X | T2 🛡️ Protectora 2/2: al invocar, Escudo 1 a otra tuya |
| 🎭 Pícaro | 🗡️ Maestría con dagas: tu héroe le pega X+1 a una enemiga (al Guardián primero) y recibe su daño | T3 🧪 Envenenadora 3/3: **Poder con Veneno** |
| 🌩️ Chamán | 🗿 Llamada totémica: el próximo tótem, con X de vida (Abrasador ⚔️1, de Piedra con Guardián, Sanador, del Viento; en ronda, porque en Hearthstone salen al azar) | T3 🌊 Chamana 2/3: al invocar, el próximo tótem con 2 de vida |
| 🌿 Druida | 🐾 Cambio de forma: ganás X y tu héroe le pega X−1 a una enemiga (recibe su daño) o al rival sin Guardián | T2 🌳 Dríade 2/2: al invocar, ganás 2 de energía (el maná del Druida) |
| 👿 Cazador de demonios | 💥 Garras demoníacas: una tuya +X de daño hasta el fin del turno | T3 🦹 Proscrita 3/2: si quedó en una punta de tu fila, +1 de daño y Carga (Marginado, con las puntas de la fila en vez de la mano) |
| 💀 Caballero de la muerte | 🧟 Carga del necrófago: un Necrófago X/1 con Carga que muere al terminar el turno | T3 ⚰️ Exhumadora 2/4: cuando muere otra tuya, ganás 1 de energía (los cadáveres) |

Detalles: los poderes a distancia (Mago, Cazador) no miran el Guardián, como en Hearthstone; cuando
el héroe ataca (Pícaro, Druida) sí, y recibe el daño de la unidad. Los Reclutas, Necrófagos y tótems son
fichas: entran 💤 como cualquier carta, salvo el Necrófago, que tiene Carga (si no ataca, le pega X a la
vida del rival antes de morir).

### Cartas de clase (6/10, idea de Leandro)

En cada turno: **2 cartas del mazo y 1 de la clase**. Nueve por clase, una por turno; los hechizos son
todos de clase. Sin armado de mazo por ahora. Los dos ven las mismas dos del mazo (si eligieron el mismo)
y la de clase de cada uno. Sin héroe, solo las dos del mazo (para comparar). Mecánicas nuevas para las
clases: **Congelar**, **Robo de vida**, **Embestida**, **Sigilo**, **auras de los costados**, duplicar
la vida, tomar el control, destruir una herida (Ejecutar), dañar una sin heridas (Puñalada) e invocar una
ficha por cada enemiga.

**🔮 Mago** (Hechizos de daño, Congelar y Poder +N):

1. 🪞 **Imagen espejo** (hechizo): Invoca 2 Reflejos (❤2, Guardián)
2. 🧙 **Aprendiz** ⚔️2 ❤2: Poder +1
3. ❄️ **Rayo de escarcha** (hechizo): 4 de daño a una unidad enemiga y congela a esa unidad
4. 💧 **Elemental de agua** ⚔️4 ❤6: Después de pelear: congela a su rival
5. ☄️ **Bola de fuego** (hechizo): 6 de daño a una unidad enemiga
6. 🔥 **Incendio** (hechizo): 3 de daño a todas las unidades enemigas
7. 🧝 **Archimaga** ⚔️6 ❤8: Poder +2
8. 🌠 **Meteoro** (hechizo): 5 de daño a una unidad enemiga y a las de sus costados
9. 🐉 **Dragona arcana** ⚔️7 ❤7: Poder +1; Al invocar: congela a todas las unidades enemigas

**🏹 Cazador** (Bestias, Carga y a la cara (el poder pasa por encima del Guardián)):

1. 🐝 **Avispa** ⚔️1 ❤2: Al invocar: 1 de daño a una unidad enemiga
2. 🦮 **Sabueso** ⚔️2 ❤2: Al pegarle al rival: +1 de maná en tu turno siguiente
3. 🦊 **Zorro carroñero** ⚔️3 ❤2: Cuando muere otra tuya: gana +2/+1
4. 🦅 **Halcón** ⚔️3 ❤3: Al invocar: 2 de daño a una unidad enemiga
5. 🦁 **Leona** ⚔️4 ❤5: Último aliento: invoca 2 Cachorros de león (⚔️2 ❤2)
6. 🐕 **Soltar a los perros** (hechizo): Invoca un Perro de caza (⚔️2 ❤1, Carga) por cada unidad enemiga
7. 🐺 **Huargo** ⚔️5 ❤7: Embestida; Al invocar: tus otras unidades: +1 de daño
8. 🦅 **Águila Real** ⚔️5 ❤6: Al invocar: 4 de daño a una unidad enemiga
9. 🐲 **Quimera** ⚔️7 ❤8: Carga; Al invocar: el rival pierde 3 de vida

**📿 Sacerdote** (Curar (sin tope), duplicar vida y tomar el control de una enemiga):

1. 🙏 **Novicia** ⚔️1 ❤2: Al usar tu poder: gana +1/+1
2. 🕯️ **Clériga** ⚔️2 ❤3: Al usar tu poder: tus otras unidades: +1 de vida
3. 👼 **Espíritu divino** ⚔️2 ❤4: Al invocar: duplica la vida de otra unidad tuya
4. 🌸 **Sanadora** ⚔️4 ❤5: Al invocar: otra unidad tuya: +3 de vida
5. 🌟 **Nova sagrada** (hechizo): 2 de daño a todas las unidades enemigas y tus unidades: +2 de vida y ganás 2 de vida
6. 😇 **Ángel** ⚔️5 ❤6: Guardián; Robo de vida
7. 🐄 **Vaca sagrada** ⚔️6 ❤8: Fin del turno: tus otras unidades: +1 de vida
8. 🕊️ **Profeta** ⚔️6 ❤9: Poder +2
9. 🌀 **Control mental** (hechizo): Tomás el control de una unidad enemiga herida

**💪 Guerrero** (Se enoja al recibir daño, Embestida, Guardián y armadura):

1. 💢 **Berserker** ⚔️1 ❤2: Al recibir daño: gana +2 de daño
2. 🗡️ **Ejecutar** (hechizo): Una unidad enemiga: si está herida, la destruye; si no, le hace 3 de daño
3. ⚒️ **Herrera** ⚔️2 ❤5: Guardián; Al recibir daño: ganás 2 de vida
4. ⛑️ **Escudero** ⚔️3 ❤5: Al invocar: ganás 4 de vida
5. 🪓 **Hachera** ⚔️5 ❤5: Embestida
6. 👺 **Señor de la guerra** ⚔️6 ❤6: Al recibir daño: gana +2 de daño y ganás 2 de vida
7. 🤺 **Espadachín** ⚔️7 ❤7: Embestida
8. 😡 **Grito infernal** ⚔️6 ❤10: Carga; Al recibir daño: gana +4 de daño
9. 🦕 **Coloso** ⚔️9 ❤10: Guardián

**⚜️ Paladín** (Escudo, Reclutas y bendiciones):

1. 🔰 **Escudero argénteo** ⚔️1 ❤1
2. 🛡️ **Protectora** ⚔️2 ❤2: Al invocar: da Escudo 1 a otra unidad tuya
3. 👑 **Bendición de reyes** (hechizo): Otra unidad tuya: +4/+4
4. 🎺 **Llamado a las armas** (hechizo): Invoca 3 Reclutas (⚔️1 ❤1) y tus unidades: +1/+1
5. ☀️ **Consagración** (hechizo): 2 de daño a todas las unidades enemigas y el rival pierde 2 de vida
6. 🏇 **Caballero argénteo** ⚔️5 ❤5: Carga
7. 💫 **Guardiana de la luz** ⚔️5 ❤7: Guardián; Mientras esté viva: las de los costados tienen +1 de vida
8. 🦄 **Unicornio** ⚔️7 ❤8: Al invocar: da Escudo 1 a otra unidad tuya
9. 🌞 **Señor de la luz** ⚔️7 ❤8: Guardián; Carga; Último aliento: invoca 2 Reclutas (⚔️1 ❤1)

**🎭 Pícaro** (Sigilo y cuchillos: elige cuándo pegar; Veneno y sacar unidades. Su héroe pelea con una daga):

1. 🔪 **Puñalada** (hechizo): 4 de daño a una unidad enemiga sin heridas
2. 🦝 **Bandida** ⚔️2 🔪1 ❤3: Sigilo
3. 🧪 **Envenenadora** ⚔️2 🔪1 ❤4: Poder con Veneno
4. 🕵️ **Espía** ⚔️3 🔪1 ❤5: Sigilo; Al invocar: silencia a una unidad enemiga
5. 🐍 **Cobra** ⚔️4 ❤7: Veneno
6. ☠️ **Asesinar** (hechizo): Destruye a una unidad enemiga
7. 🗡️ **Maestra de dagas** ⚔️3 🔪3 ❤8: Sigilo; Veneno
8. 🌙 **Asesina de la noche** ⚔️5 🔪3 ❤7: Sigilo; Al invocar: 3 de daño a una unidad enemiga
9. 🌑 **Sombra** ⚔️6 🔪4 ❤10: Sigilo

**🌩️ Chamán** (Tótems (en ronda), auras, rayos y elementales):

1. 🧊 **Descarga de escarcha** (hechizo): 3 de daño a una unidad enemiga y congela a esa unidad
2. 🏮 **Tótem lengua de fuego** ❤3: Mientras esté viva: las de los costados tienen +2 de daño
3. 🌊 **Chamana** ⚔️2 ❤3: Al invocar: invoca tu próximo tótem, con 2 de vida
4. ⚡ **Cadena de relámpagos** (hechizo): 3 de daño a una unidad enemiga y a las de sus costados
5. 🐺 **Lobos espectrales** (hechizo): Invoca 2 Lobos espectrales (⚔️3 ❤3, Guardián)
6. 🔥 **Elemental de fuego** ⚔️5 ❤5: Al invocar: 3 de daño a una unidad enemiga
7. ⛰️ **Elemental de tierra** ⚔️5 ❤8: Guardián; Al invocar: invoca tu próximo tótem, con 3 de vida
8. ⛈️ **Tormenta eléctrica** (hechizo): 4 de daño a todas las unidades enemigas
9. 🌋 **Erupción** (hechizo): 3 de daño a todas las unidades enemigas y el rival pierde 3 de vida

**🌿 Druida** (Energía, crías que crecen, bestias grandes y refuerzos a todas):

1. 🐮 **Ternero** ⚔️1 ❤1: Fin del turno: gana +1/+1
2. 🌳 **Dríade** ⚔️2 ❤2: Al invocar: +2 de maná en tu turno siguiente
3. 🐾 **Zarpazo** (hechizo): 3 de daño a una unidad enemiga y ganás 2 de vida
4. 🌱 **Ent joven** ⚔️4 ❤5: Guardián; Al invocar: +1 de maná en tu turno siguiente
5. 🌷 **Primavera** (hechizo): Tus unidades: +2/+2
6. 🌴 **Ancestro** ⚔️5 ❤7: Guardián; Al invocar: +2 de maná en tu turno siguiente
7. 🐻 **Oso** ⚔️6 ❤7: Carga
8. 🍃 **Fuerza de la naturaleza** (hechizo): Invoca 3 Treantes (⚔️3 ❤2, Carga)
9. 🐎 **Estampida** (hechizo): Tus unidades: +3/+3

**👿 Cazador de demonios** (Las puntas de la fila, Embestida y Robo de vida):

1. 😈 **Diablillo** ⚔️1 ❤2: Al invocar: si quedó en una punta de tu fila, gana +1/+1
2. 💚 **Golpe vil** (hechizo): 2 de daño a una unidad enemiga y ganás 2 de vida
3. 🦹 **Proscrita** ⚔️3 ❤2: Al invocar: si quedó en una punta de tu fila, gana +1 de daño y Carga
4. 👻 **Cazador de almas** ⚔️3 ❤3: Embestida; Robo de vida
5. 🐕 **Mastín vil** ⚔️4 ❤4: Embestida; Al invocar: si quedó en una punta de tu fila, gana +2 de daño
6. 👁️ **Rayo ocular** (hechizo): 4 de daño a una unidad enemiga y ganás 4 de vida
7. 👾 **Demonio del abismo** ⚔️6 ❤7: Guardián; Robo de vida
8. 👿 **Señor demoníaco** ⚔️7 ❤7: Embestida; Robo de vida
9. 🧛 **Gran cazador** ⚔️7 ❤8: Carga; Al invocar: si quedó en una punta de tu fila, gana Robo de vida

**💀 Caballero de la muerte** (Las muertes dan energía; Aguante, Congelar y Robo de vida):

1. 🧟 **Zombi** ⚔️1 ❤2: Aguante
2. 🥶 **Golpe de escarcha** (hechizo): 3 de daño a una unidad enemiga y congela a esa unidad
3. ⚰️ **Exhumadora** ⚔️3 ❤4: Cuando muere otra tuya: +1 de maná en tu turno siguiente
4. 👹 **Abominación** ⚔️4 ❤4: Guardián; Último aliento: 2 de daño a todas las unidades enemigas
5. 🩸 **Señor de la sangre** ⚔️4 ❤6: Robo de vida; Aguante
6. ☣️ **Muerte y descomposición** (hechizo): 2 de daño a todas las unidades enemigas y +2 de maná en tu turno siguiente
7. 🦴 **Gigante de hueso** ⚔️7 ❤8: Aguante
8. 🤴 **Rey de la escarcha** ⚔️6 ❤8: Guardián; Fin del turno: invoca un Esqueleto (⚔️1 ❤1)
9. 🐉 **Dragona de hueso** ⚔️7 ❤8: Robo de vida; Aguante

## Preguntas abiertas

- Posición: ¿que importe en el combate (atacar solo a la de enfrente, o que Guardián cubra solo a las
  de los costados)? (Las auras ya están.)
- Más efectos chicos de Hearthstone para probar: furia (más ataque mientras está herida), «después de
  que lanzás un hechizo». (Sigilo y crecer cuando muere otra ya están, en las clases.)
- Si sigue habiendo demasiadas muertes gratis: que el defensor elija quién recibe el ataque (como
  bloquear en Magic), o que el daño se cure al final del turno.
- Con la vida nueva, ¿Pradera tiene con qué frenar la carrera? (Guardián, curar la vida, castigar al
  que va a la cara.)
- ¿Lo que pega a la vida es el daño o el nivel? (Las dos cosas están en el panel.)
- ¿Vuelve el triángulo, más suave (por ejemplo, que gane +1 de daño en vez de pegar primero)? ¿Y el
  arco, en pocas cartas como la lanza?
- ¿10 turnos con una fila más de cartas, en vez de una ronda sin cartas?
- Sacrificio: "en tu turno podés sacrificar una unidad por uno de tu recurso". ¿Qué recurso?
- ¿El Sacerdote cura X+1 (por defecto) o 2X? Con X era el héroe más flojo; en Hearthstone curar 2
  vale lo mismo que 1 de daño.
- ¿Poderes que se cargan con algo propio de la clase (cada muerte, cada golpe a la cara) en vez de 1 de
  energía por turno para todos? Hoy lo hacen algunas cartas de clase (Sabueso, Exhumadora, Dríade).

## Estacionado

- Monetización: personajes de clase como animales antropomórficos, skins por clase y por unidad.
- Expansión con tablero: posición de las unidades y reglas que se activan según los casilleros del
  borde ocupados.

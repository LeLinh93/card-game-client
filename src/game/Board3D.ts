import {
    AdditiveBlending, Box3, BufferGeometry, CanvasTexture, DoubleSide, Euler, Float32BufferAttribute, Material, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Plane, PlaneGeometry,
    Quaternion, Raycaster, RepeatWrapping, sRGBEncoding, Texture, Vector2, Vector3
} from "three";
import {Engine3D} from "./Engine3D";
import {cardCanvas, fieldSquareCanvas, squareCanvas, squareFrom} from "./cardTexture";
import {CardFace, HAS_STATS} from "../components/CardView";
import {canAttack, canUseActive, GameCard, isKnown} from "./protocol";

// Assets of the threngine project
const CARD_GEOMETRY = "75lh4pn8";    // "cardGame": the meshes Card_Front and Card_Back
const SQUARE_GEOMETRY = "ztthtet7";    // "SquareCard": a card on the field, showing its picture
const CARD_BACK_MATERIAL = "b0g6q05i";    // "card_border", the back the decks show
// "Door Close" opens the sphere played backwards (0) and closes it forwards (1); the scene loads closed
const SPHERE_ANIMATION = "f0p48svl";
// "End Turn ": the button flips over (1) when the player ends their turn, and back (0) on their next
const END_TURN_ANIMATION = "qfirstje";
const END_TURN_BUTTON = "BUTTON";
// Objects of the play area: the player sits on the near side
const DECKS = {player:"Deck1", opponent:"Deck"};
const SPHERE = "Sphere_gizmo";
// Each player's portal, in the corner of their side: an attacker dropped on the opponent's attacks
// them directly, once their field is empty
const PORTALS = {player:"Av1", opponent:"Av"};
const PORTAL_REACH = 0.024;
// The "24" next to each deck: 3D text, replaced by a counter of the side's resources
const COUNTERS = {player:"Text001", opponent:"Text"};
const COUNTER_FACES = {player:"polySurface21001", opponent:"polySurface21"};

// The field, in m: 5 slots per row, numbered 0 to 4 from left to right as the player sees them
const SLOT = 0.0264;
const SLOT_GAP = 0.003;
// Centred in the gold ring (polySurface13, middle at x -0.003), a little left of it so the right
// ends of the back rows stay clear of the decks
const FIELD_X = -0.004;
const ROWS = {player:{front:0.003, back:0.034}, opponent:{front:-0.036, back:-0.067}};
// How far a dragged card floats above the board; it stays the size of a zone
const DRAG_HEIGHT = 0.012;
const DRAG_SCALE = 1;
// Within this distance of the sphere's middle (on the board), a dragged card is over the sphere
const SPHERE_REACH = 0.02;
// The holo line of an aimed spell: its width (m), and how fast its stripes run (repeats a second)
const BEAM_WIDTH = 0.004;
const BEAM_SPEED = 2.5;
// The board, where a spell without a target can be dropped (the floor inside the walls)
const BOARD = {minX:-0.115, maxX:0.105, minZ:-0.12, maxZ:0.088};
// How high an attacking card floats before it strikes
const ATTACK_HEIGHT = 0.02;
// Skill damage: the lightning's strips (m wide), how long it shows (ms) and how hard it shakes the
// view; the arrows' length (m), flight and the time between them (ms), and how much the card shakes
// as each hits. Both are over in well under a second.
const BOLT_GLOW = 0.008;
const BOLT_CORE = 0.0018;
const LIGHTNING_TIME = 350;
const LIGHTNING_SHAKE = 0.006;
const ARROW_LENGTH = 0.03;
const ARROW_FLIGHT = 90;
const ARROW_GAP = 70;
const ARROW_SHAKE = 0.0016;

const DRAW_TIME = 550;
const PLACE_TIME = 380;
// How high a drawn card lifts off the deck, in m
const DRAW_ARC = 0.03;
// Drawn above everything else in the scene
const RENDER_ORDER = 1000;
// The engine blends in linear light, so a white this transparent looks like about 20% white on screen
// (measured over the board: 0.045 brings it from about 40 to 79 of 255)
const ZONE_OPACITY = 0.045;
// A highlighted zone gets a soft glowing edge (a ring a little bigger than the zone, pulsing gently)
const GLOW_SIZE = 1.5;
const GLOW_WHITE = 0xbfe9ff;
const GLOW_GOLD = 0xffc65a;
const GLOW_RED = 0xff4a3a;
const GLOW_SOFT = 0.5;
// Marks on field cards: how dark a card that can't attack gets (the engine blends in linear light,
// so this looks like about 40% darker on screen)
const DIM_OPACITY = 0.65;
// The hero glow's plane, as many times the card's size: room for the halo outside the border
const HERO_GLOW_SIZE = 1.25;
// The disc with the number of cards left on top of each deck, in m
const DECK_COUNTER_SIZE = 0.016;

export type Side = "player" | "opponent";
export type Row = "front" | "back";
export type DropTarget = {kind:"sphere"} | {kind:"zone", row:Row, index:number} | {kind:"card", cardID:string} | {kind:"board"} | null;
// How a hand card is dragged: onto a zone (units, structures, traps); with a line to the card it is
// aimed at (spells and abilities with a target); or onto the board (spells and abilities without).
// Any of them can be dropped on the sphere to sacrifice it.
export type DragKind = "summon" | "aim" | "cast";

interface Tween{
    start:number;
    duration:number;
    update:(t:number)=>void;
    done:()=>void;
}

// On a field card: a gold glow round a hero, a dark layer while it can't attack, a glowing
// diamond in its top left corner while its Active skill can be used
type Mark = "hero" | "dim" | "active";

interface FieldCard{
    cardID:string;
    // What its picture shows: the card's picture, or its back while face down
    look:string;
    object:Object3D;
    // The card as last told, and its marks (made when first shown)
    card:GameCard;
    marks:Partial<Record<Mark, Mesh>>;
}

const easeInOut = (t:number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const wait = (ms:number) => new Promise<void>(resolve => setTimeout(resolve, ms));
// The cards lie face up (front along +Y, top towards -Z); these turn them to face the camera
const FACING_CAMERA = new Quaternion().setFromEuler(new Euler(Math.PI / 2, 0, 0));
const BACK_TO_CAMERA = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0));
const FACE_DOWN = new Quaternion().setFromEuler(new Euler(0, 0, Math.PI));
const FLAT = new Quaternion();

const unlit = (params = {}) => new MeshBasicMaterial({toneMapped:false, ...params});

// The 3D side of a match, on top of the play area: cards flying from the decks to the hands, the
// field's zones and the cards on them, the resource counters, the sphere, and dragging a hand card.
export class Board3D{
    private cardTemplate:Object3D;
    private squareTemplate:Object3D;
    private backMaterial:Material;
    private squareBackMaterial:Material;
    private squareMaterials = new Map<string, {material:MeshBasicMaterial, ready:Promise<void>}>();
    // The card's length in m, which the hand card's height matches when it lands
    private cardLength:number;
    private decks:Record<Side, Vector3> = {player:null, opponent:null};
    private sphere:Vector3;
    private sphereOpen = false;
    private portals:Record<Side, Vector3> = {player:null, opponent:null};
    // The glow over the opponent's portal: off, open (the field is empty) or aimed at
    private portalGlow:{mesh:Mesh, level:number} = null;
    private counters:Record<Side, {canvas:HTMLCanvasElement, texture:Texture, value:number}> = {player:null, opponent:null};
    // The number of cards left, on top of each deck
    private deckCounters:Record<Side, {canvas:HTMLCanvasElement, texture:Texture, value:number}> = {player:null, opponent:null};
    private zones:Record<Side, Record<Row, Mesh[]>> = {player:{front:[], back:[]}, opponent:{front:[], back:[]}};
    private field:Record<Side, Record<Row, FieldCard[]>> = {player:{front:[], back:[]}, opponent:{front:[], back:[]}};
    // The card being dragged, then held over where it was dropped until the server answers
    private drag:{card:GameCard, kind:DragKind, object:Object3D, target:DropTarget, beam:Mesh, from:Vector3, targets:Set<string>} = null;
    private beamFrame:number = null;
    private held:{cardID:string, object:Object3D} = null;
    private tweens:Tween[] = [];
    private frame:number = null;
    // Whose turn it is: the Active mark shows on the player's turn only
    private yourTurn = false;
    // A field card's size (m) and how high its top is, for the marks on it
    private squareSize:number;
    private squareTop:number;
    private markMaterials:Record<Mark, MeshBasicMaterial> = null;
    private markFrame:number = null;
    private stopped = false;

    // handArea: where a side's hand is on screen, for cards that come from or go to it
    constructor(private engine:Engine3D, private handArea:(side:Side)=>DOMRect){}

    private get scene(){
        return this.engine.engine.services.render.scene;
    }

    private get camera(){
        return this.engine.engine.services.render.camera as PerspectiveCamera;
    }

    // Loads the card models and finds the decks, sphere and counters; call once the scene is up
    async prepare(){
        const services = this.engine.engine.services;
        const [cardTemplate, squareTemplate, back] = await Promise.all([
            services.geometry.getClone(CARD_GEOMETRY),
            services.geometry.getClone(SQUARE_GEOMETRY),
            services.material.getMaterial(CARD_BACK_MATERIAL),
        ]);
        // The back's picture, unlit like the fronts (a copy of the project's shader material draws black)
        const backMap = (back.getMaterials()[0] as any).map;
        this.backMaterial = unlit({map:backMap, depthTest:false});
        const squareBack = new CanvasTexture(squareFrom(backMap.image));
        squareBack.flipY = false;
        squareBack.encoding = sRGBEncoding;
        this.squareBackMaterial = unlit({map:squareBack});
        this.cardTemplate = cardTemplate;
        this.squareTemplate = squareTemplate;
        this.cardLength = new Box3().setFromObject(cardTemplate).getSize(new Vector3()).z;
        const square = new Box3().setFromObject(squareTemplate);
        this.squareSize = square.getSize(new Vector3()).x;
        this.squareTop = square.max.y;

        (Object.keys(DECKS) as Side[]).forEach((side)=>{
            const box = new Box3().setFromObject(this.scene.getObjectByName(DECKS[side]));
            // On top of the deck, a little above it so the counter by the deck stays visible
            this.decks[side] = box.getCenter(new Vector3()).setY(box.max.y + 0.002);
            this.makeCounter(side);
            this.makeDeckCounter(side, box);
            (["front", "back"] as Row[]).forEach((row)=>{
                for(let i = 0; i < 5; i++){
                    const zone = this.square(unlit({color:0xffffff, transparent:true, opacity:ZONE_OPACITY, depthWrite:false}));
                    zone.position.copy(this.slotPosition(side, row, i)).setY(-0.0004);
                    this.scene.add(zone);
                    this.zones[side][row].push(zone.getObjectByProperty("isMesh", true) as Mesh);
                    this.field[side][row].push(null);
                }
            });
        });
        this.sphere = new Box3().setFromObject(this.scene.getObjectByName(SPHERE)).getCenter(new Vector3());
        (Object.keys(PORTALS) as Side[]).forEach((side)=>{
            const portal = this.scene.getObjectByName(PORTALS[side]);
            this.portals[side] = portal ? new Box3().setFromObject(portal).getCenter(new Vector3()) : null;
        });
    }

    // The card back's picture, for the hands drawn in HTML
    get backImage():string{
        const map = (this.backMaterial as any).map;
        return map && map.image ? map.image.src : "";
    }

    stop(){
        this.stopped = true;
        if(this.frame !== null){
            cancelAnimationFrame(this.frame);
        }
        if(this.markFrame !== null){
            cancelAnimationFrame(this.markFrame);
        }
        this.tweens.forEach(t => t.done());
        this.tweens = [];
    }

    //drawing---------------------------------------------------------------------------------

    // A card flies face down from the side's deck to where target() is on screen, turning face up
    // on the way if a face is given. Resolves when it lands; the 3D card is gone by then.
    drawCard(side:Side, face:CardFace, target:()=>DOMRect):Promise<void>{
        if(this.stopped || !this.cardTemplate){
            return Promise.resolve();
        }
        const card = this.cardTemplate.clone(true);
        const front = unlit({color:0x222222, depthTest:false});
        card.traverse((o)=>{
            if((o as Mesh).isMesh){
                (o as Mesh).material = o.name === "Card_Front" ? front : this.backMaterial;
                o.renderOrder = RENDER_ORDER;
            }
        });
        if(face){
            cardCanvas(face).then((canvas)=>{
                front.map = this.texture(canvas);
                front.color.set(0xffffff);
                front.needsUpdate = true;
            }, (e)=>{console.log("card picture failed", e)});
        }
        const start = {position:this.decks[side].clone(), rotation:FACE_DOWN.clone()};
        card.position.copy(start.position);
        card.quaternion.copy(start.rotation);
        this.scene.add(card);
        return this.tween(DRAW_TIME, (t)=>{
            const end = this.screenPose(target(), !!face);
            if(!end){
                return;
            }
            const e = easeInOut(t);
            card.position.lerpVectors(start.position, end.position, e);
            card.position.y += Math.sin(Math.PI * e) * DRAW_ARC;
            card.quaternion.slerpQuaternions(start.rotation, end.rotation, e);
        }).then(()=>{
            card.removeFromParent();
            front.map?.dispose();
            front.dispose();
        });
    }

    //field-----------------------------------------------------------------------------------

    // Brings a side's field in line with the server's: new cards move onto their zone (the held
    // card where it was dropped; at the start of the game, the backline from the deck one by one;
    // otherwise from the hand), cards that left are taken away. Resolves once all are in place.
    async syncField(side:Side, frontline:GameCard[], backline:GameCard[], fromDeck = false){
        const moves:Promise<void>[] = [];
        for(const row of ["front", "back"] as Row[]){
            const cards = row === "front" ? frontline : backline;
            for(let i = 0; i < 5; i++){
                const card = cards[i] || null;
                const current = this.field[side][row][i];
                if(current && card && current.cardID === card.id){
                    this.setLook(current, card);
                    this.setMarks(side, current, card);
                    continue;
                }
                if(current){
                    current.object.removeFromParent();
                    this.field[side][row][i] = null;
                }
                if(!card){
                    continue;
                }
                const placed = this.placeCard(side, row, i, card, fromDeck);
                moves.push(placed);
                if(fromDeck){
                    await wait(120);
                }
            }
        }
        await Promise.all(moves);
    }

    private placeCard(side:Side, row:Row, index:number, card:GameCard, fromDeck:boolean):Promise<void>{
        let object:Object3D;
        let from:{position:Vector3, rotation:Quaternion};
        if(this.held && this.held.cardID === card.id && side === "player"){
            object = this.held.object;
            from = {position:object.position.clone(), rotation:object.quaternion.clone()};
            this.held = null;
        }
        else{
            object = this.square(this.squareBackMaterial);
            const origin = fromDeck ? this.decks[side] : this.screenPoint(this.handArea(side)) || this.decks[side];
            from = {position:origin.clone(), rotation:FLAT.clone()};
            object.position.copy(from.position);
            this.scene.add(object);
        }
        const fieldCard:FieldCard = {cardID:card.id, look:null, object, card, marks:{}};
        this.setLook(fieldCard, card);
        this.setMarks(side, fieldCard, card);
        this.field[side][row][index] = fieldCard;
        const to = this.slotPosition(side, row, index);
        const fromScale = object.scale.x;
        return this.tween(PLACE_TIME, (t)=>{
            const e = easeInOut(t);
            object.position.lerpVectors(from.position, to, e);
            object.position.y += Math.sin(Math.PI * e) * (fromDeck ? DRAW_ARC : 0.01);
            object.quaternion.slerpQuaternions(from.rotation, FLAT, e);
            object.scale.setScalar(fromScale + (1 - fromScale) * e);
        });
    }

    // Face-down cards show the back; the others their picture
    // Face-down cards show the back; units and structures their picture with their stats, the others
    // just their picture. A card turned face up flips over; changed stats show once drawn.
    private setLook(fieldCard:FieldCard, card:GameCard){
        let look = "back";
        let draw:()=>Promise<HTMLCanvasElement> = null;
        if(!card.isHidden && isKnown(card) && card.imagePath){
            const stats = HAS_STATS.includes(card.type) ? {attack:card.attack, defense:card.defense, health:card.health} : null;
            look = card.imagePath + (stats ? "|" + [stats.attack, stats.defense, stats.health].join("/") : "");
            draw = stats ? ()=>fieldSquareCanvas(card.imagePath, stats) : ()=>squareCanvas(card.imagePath);
        }
        if(fieldCard.look === look){
            return;
        }
        const before = fieldCard.look;
        fieldCard.look = look;
        if(!draw){
            this.setMaterial(fieldCard.object, this.squareBackMaterial);
            return;
        }
        const {material, ready} = this.squareMaterial(look, draw);
        if(before === "back"){
            this.flip(fieldCard.object, material);
        }
        else if(before === null){
            this.setMaterial(fieldCard.object, material);
        }
        else{
            ready.then(()=>{
                if(fieldCard.look === look){
                    this.setMaterial(fieldCard.object, material);
                }
            });
        }
    }

    // The picture of a hand card, for dragging it
    private pictureMaterial(imagePath:string):Material{
        return this.squareMaterial(imagePath, ()=>squareCanvas(imagePath)).material;
    }

    private squareMaterial(key:string, draw:()=>Promise<HTMLCanvasElement>){
        if(!this.squareMaterials.has(key)){
            const material = unlit({color:0x333333});
            const ready = draw().then((canvas)=>{
                material.map = this.texture(canvas);
                material.color.set(0xffffff);
                material.needsUpdate = true;
            }, (e)=>{console.log("card picture failed", key, e)});
            this.squareMaterials.set(key, {material, ready});
        }
        return this.squareMaterials.get(key);
    }

    // A face-down card turns face up: it lifts, turns over showing its face, and lands
    private async flip(object:Object3D, face:Material){
        const base = object.position.clone();
        let shown = false;
        await this.tween(450, (t)=>{
            const e = easeInOut(t);
            object.position.copy(base).setY(base.y + Math.sin(Math.PI * t) * 0.012);
            // Half way the card stands on its edge: the face goes on for the second half
            if(!shown && e >= 0.5){
                shown = true;
                this.setMaterial(object, face);
            }
            object.quaternion.setFromEuler(new Euler(0, 0, Math.PI * (shown ? e - 1 : e)));
        });
        object.position.copy(base);
        object.quaternion.copy(FLAT);
    }

    private slotPosition(side:Side, row:Row, index:number):Vector3{
        return new Vector3(FIELD_X + (index - 2) * (SLOT + SLOT_GAP), 0, ROWS[side][row]);
    }

    // The field card under this point of the screen, if any
    fieldCardAt(x:number, y:number):{side:Side, cardID:string}{
        const cards:{side:Side, card:FieldCard}[] = [];
        (["player", "opponent"] as Side[]).forEach((side)=>{
            (["front", "back"] as Row[]).forEach((row)=>{
                this.field[side][row].forEach((card)=>{
                    if(card){
                        cards.push({side, card});
                    }
                });
            });
        });
        if(cards.length <= 0){
            return null;
        }
        const view = this.engine.mount.getBoundingClientRect();
        const ray = new Raycaster();
        this.camera.updateMatrixWorld();
        ray.setFromCamera(new Vector2(((x - view.left) / view.width) * 2 - 1, -(((y - view.top) / view.height) * 2 - 1)), this.camera);
        const hit = ray.intersectObjects(cards.map(c => c.card.object), true)[0];
        if(!hit){
            return null;
        }
        const found = cards.find(c => c.card.object === hit.object || c.card.object.getObjectById(hit.object.id));
        return found ? {side:found.side, cardID:found.card.cardID} : null;
    }

    //resources------------------------------------------------------------------------------

    private makeCounter(side:Side){
        const text = this.scene.getObjectByName(COUNTERS[side]);
        const face = this.scene.getObjectByName(COUNTER_FACES[side]);
        if(!text || !face){
            return;
        }
        text.visible = false;
        const box = new Box3().setFromObject(face);
        const size = box.getSize(new Vector3());
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 128;
        const texture = this.texture(canvas);
        // Unlike the models' textures, a three.js plane's expects the picture flipped
        texture.flipY = true;
        const label = new Mesh(new PlaneGeometry(size.x, size.z), unlit({map:texture, transparent:true, depthWrite:false}));
        label.rotation.x = -Math.PI / 2;
        label.position.copy(box.getCenter(new Vector3())).setY(box.max.y + 0.0004);
        this.scene.add(label);
        this.counters[side] = {canvas, texture, value:null};
        this.setResources(side, 0);
    }

    // A dark disc with the number of cards left, lying on top of the deck
    private makeDeckCounter(side:Side, deck:Box3){
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 128;
        const texture = this.texture(canvas);
        texture.flipY = true;
        const size = DECK_COUNTER_SIZE;
        const label = new Mesh(new PlaneGeometry(size, size), unlit({map:texture, transparent:true, depthWrite:false}));
        label.rotation.x = -Math.PI / 2;
        label.position.copy(deck.getCenter(new Vector3())).setY(deck.max.y + 0.0006);
        this.scene.add(label);
        this.deckCounters[side] = {canvas, texture, value:null};
    }

    setDeckCount(side:Side, value:number){
        const counter = this.deckCounters[side];
        if(!counter || counter.value === value){
            return;
        }
        counter.value = Math.max(0, value);
        const g = counter.canvas.getContext("2d");
        g.clearRect(0, 0, 128, 128);
        g.fillStyle = "rgba(8, 10, 14, 0.82)";
        g.beginPath();
        g.arc(64, 64, 58, 0, Math.PI * 2);
        g.fill();
        g.lineWidth = 5;
        g.strokeStyle = "rgba(255, 210, 122, 0.85)";
        g.stroke();
        g.font = "bold " + (counter.value >= 100 ? 48 : 62) + "px GWENT, Georgia, serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = "#fff";
        g.fillText(String(counter.value), 64, 68);
        counter.texture.needsUpdate = true;
    }

    // A card leaves the deck (its counter counts one down before the server's next state says so)
    takeFromDeck(side:Side){
        const counter = this.deckCounters[side];
        if(counter && counter.value !== null){
            this.setDeckCount(side, counter.value - 1);
        }
    }

    setResources(side:Side, value:number){
        const counter = this.counters[side];
        if(!counter || counter.value === value){
            return;
        }
        counter.value = value;
        const g = counter.canvas.getContext("2d");
        g.clearRect(0, 0, 128, 128);
        g.font = "bold " + (value >= 100 ? 54 : 72) + "px GWENT, Georgia, serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.lineWidth = 8;
        g.strokeStyle = "#000";
        g.fillStyle = "#fff";
        g.strokeText(String(value), 64, 68);
        g.fillText(String(value), 64, 68);
        counter.texture.needsUpdate = true;
    }

    //end turn button-------------------------------------------------------------------------

    // Whether this point of the screen is over the End Turn button
    endTurnButtonAt(x:number, y:number):boolean{
        const button = this.scene.getObjectByName(END_TURN_BUTTON);
        if(!button){
            return false;
        }
        const view = this.engine.mount.getBoundingClientRect();
        const ray = new Raycaster();
        this.camera.updateMatrixWorld();
        ray.setFromCamera(new Vector2(((x - view.left) / view.width) * 2 - 1, -(((y - view.top) / view.height) * 2 - 1)), this.camera);
        return ray.intersectObject(button, true).length > 0;
    }

    // Face up on the player's turn; flipped over while the opponent plays
    setEndTurnButton(yourTurn:boolean, instant = false){
        this.engine.configurator.setAnimationGroup(END_TURN_ANIMATION, {position:{to:yourTurn ? 0 : 1}, instant}).catch((e)=>{console.log(e)});
        this.yourTurn = yourTurn;
        (["player", "opponent"] as Side[]).forEach((side)=>{
            (["front", "back"] as Row[]).forEach((row)=>{
                this.field[side][row].forEach(f => f && this.setMarks(side, f, f.card));
            });
        });
    }

    //marks-----------------------------------------------------------------------------------

    // Heroes glow gold on both sides; the player's units and structures that can't attack are
    // dimmed (not those with no attack, which never can), and on their turn their cards whose
    // Active skill can be used get the diamond
    private setMarks(side:Side, fieldCard:FieldCard, card:GameCard){
        fieldCard.card = card;
        const shown = !card.isHidden && isKnown(card);
        const mine = side === "player" && shown;
        this.showMark(fieldCard, "hero", shown && !!card.hero);
        this.showMark(fieldCard, "dim", mine && (card.type === "unit" || card.type === "structure") && card.attack > 0 && !canAttack(card));
        this.showMark(fieldCard, "active", mine && this.yourTurn && canUseActive(card));
    }

    private showMark(fieldCard:FieldCard, mark:Mark, on:boolean){
        let mesh = fieldCard.marks[mark];
        if(!on){
            if(mesh){
                mesh.visible = false;
            }
            return;
        }
        if(!mesh){
            mesh = this.makeMark(mark);
            fieldCard.object.add(mesh);
            fieldCard.marks[mark] = mesh;
        }
        mesh.visible = true;
        if(mark !== "dim" && this.markFrame === null){
            this.markFrame = requestAnimationFrame(this.pulseMarks);
        }
    }

    // The marks lie on the card (it lies flat, its top towards -Z), so they move with it
    private makeMark(mark:Mark):Mesh{
        if(!this.markMaterials){
            const glowing = {transparent:true, blending:AdditiveBlending, depthWrite:false};
            this.markMaterials = {
                hero:unlit({map:this.heroGlowTexture(), ...glowing}),
                dim:unlit({color:0x000000, transparent:true, opacity:DIM_OPACITY, depthWrite:false}),
                // Over the card's picture (with the depth test, the picture hides it)
                active:unlit({map:this.diamondTexture(), transparent:true, depthTest:false, depthWrite:false}),
            };
        }
        const size = this.squareSize;
        let geometry:PlaneGeometry;
        let position:Vector3;
        if(mark === "hero"){
            geometry = new PlaneGeometry(size * HERO_GLOW_SIZE, size * HERO_GLOW_SIZE);
            position = new Vector3(0, 0.0012, 0);
        }
        else if(mark === "dim"){
            geometry = new PlaneGeometry(size, size);
            position = new Vector3(0, this.squareTop + 0.0002, 0);
        }
        else{
            const w = size * 0.4;
            geometry = new PlaneGeometry(w, w);
            position = new Vector3(-size / 2 + w * 0.4, this.squareTop + 0.0004, -size / 2 + w * 0.45);
        }
        geometry.rotateX(-Math.PI / 2);
        const mesh = new Mesh(geometry, this.markMaterials[mark]);
        mesh.position.copy(position);
        mesh.renderOrder = mark === "hero" ? RENDER_ORDER - 1 : mark === "dim" ? 1 : 2;
        // Not part of the card: its picture isn't put on the mark, and the pointer finds the card only
        mesh.userData.mark = true;
        mesh.raycast = ()=>{};
        return mesh;
    }

    // The hero glow and the Active mark pulse gently while any is shown
    private pulseMarks = (now:number)=>{
        const lit = (mark:Mark) => (["player", "opponent"] as Side[]).some(side => (["front", "back"] as Row[]).some(row =>
            this.field[side][row].some(f => f && f.marks[mark] && f.marks[mark].visible)));
        this.markMaterials.hero.opacity = 0.75 + 0.25 * Math.sin(now / 320);
        this.markMaterials.active.opacity = 0.8 + 0.2 * Math.sin(now / 200);
        this.markFrame = !this.stopped && (lit("hero") || lit("active")) ? requestAnimationFrame(this.pulseMarks) : null;
    }

    // A very thin gold line on the card's border with a soft orange halo outside it; nothing inside the card
    private heroGlowTexture():Texture{
        const size = 512;
        return this.textures.hero || (this.textures.hero = this.canvasTexture(size, size, true, (g)=>{
            const inset = size * (1 - 1 / HERO_GLOW_SIZE) / 2;
            const rect = (pad:number)=>{
                const x = inset - pad, w = size - 2 * x, r = 8 + pad;
                g.beginPath();
                g.moveTo(x + r, x);
                g.arcTo(x + w, x, x + w, x + w, r);
                g.arcTo(x + w, x + w, x, x + w, r);
                g.arcTo(x, x + w, x, x, r);
                g.arcTo(x, x, x + w, x, r);
                g.closePath();
            };
            g.strokeStyle = g.shadowColor = "#ff8a1e";
            g.shadowBlur = 14;
            g.globalAlpha = 0.65;
            g.lineWidth = 2;
            rect(1);
            g.stroke();
            g.stroke();
            g.strokeStyle = "#ffe3a0";
            g.shadowColor = "#ffb347";
            g.shadowBlur = 3;
            g.globalAlpha = 1;
            g.lineWidth = 2;
            rect(1);
            g.stroke();
            // Only outward: clear everything over the card
            g.globalCompositeOperation = "destination-out";
            g.shadowBlur = 0;
            rect(0);
            g.fill();
        }));
    }

    // A glowing cyan diamond, tall and narrow, on a dark edge so it shows on any picture
    private diamondTexture():Texture{
        return this.textures.diamond || (this.textures.diamond = this.canvasTexture(128, 128, true, (g)=>{
            const shape = ()=>{
                g.beginPath();
                g.moveTo(64, 18);
                g.lineTo(90, 64);
                g.lineTo(64, 110);
                g.lineTo(38, 64);
                g.closePath();
            };
            g.lineJoin = "round";
            g.shadowColor = "rgba(0, 0, 0, 0.9)";
            g.shadowBlur = 8;
            g.strokeStyle = "rgba(0, 0, 0, 0.75)";
            g.lineWidth = 10;
            shape();
            g.stroke();
            g.shadowColor = "#5fe0ff";
            g.shadowBlur = 18;
            g.fillStyle = "#5fe0ff";
            shape();
            g.fill();
            g.fill();
            g.shadowBlur = 0;
            g.strokeStyle = "#e6fbff";
            g.lineWidth = 4;
            shape();
            g.stroke();
        }));
    }

    //sphere----------------------------------------------------------------------------------

    private setSphereOpen(open:boolean){
        if(this.sphereOpen === open){
            return;
        }
        this.sphereOpen = open;
        this.engine.configurator.setAnimationGroup(SPHERE_ANIMATION, {position:{to:open ? 0 : 1}}).catch((e)=>{console.log(e)});
    }

    // The held card goes down into the sphere, which then closes
    async sacrificeHeld(){
        if(!this.held){
            return;
        }
        const object = this.held.object;
        this.held = null;
        await this.sink(object);
    }

    // The opponent sacrificed a card from their hand: it comes face down from their hand into the sphere
    async sacrificeFrom(side:Side){
        const object = this.square(this.squareBackMaterial);
        object.position.copy(this.screenPoint(this.handArea(side)) || this.decks[side]);
        this.scene.add(object);
        this.setSphereOpen(true);
        const from = object.position.clone();
        const above = this.sphere.clone().setY(this.sphere.y + DRAG_HEIGHT);
        await this.tween(PLACE_TIME, (t)=>{object.position.lerpVectors(from, above, easeInOut(t))});
        await this.sink(object);
    }

    private async sink(object:Object3D){
        this.setSphereOpen(true);
        const from = object.position.clone();
        const fromScale = object.scale.x;
        const above = this.sphere.clone().setY(this.sphere.y + 0.006);
        const inside = this.sphere.clone().setY(this.sphere.y - 0.004);
        await this.tween(220, (t)=>{object.position.lerpVectors(from, above, easeInOut(t))});
        await this.tween(260, (t)=>{
            object.position.lerpVectors(above, inside, t);
            object.scale.setScalar(fromScale * (1 - 0.7 * t));
        });
        object.removeFromParent();
        this.setSphereOpen(false);
    }

    //dragging a hand card---------------------------------------------------------------------

    // The card leaves the hand: as a SquareCard floating under the pointer, or for an aimed spell, as
    // a holo line from "from" (the hand card on screen) to the pointer. targets: the cards it can aim at.
    startDrag(card:GameCard, x:number, y:number, kind:DragKind = "summon", targets:string[] = [], from:{x:number, y:number} = null){
        this.cancelDrag();
        const object = this.square(isKnown(card) && card.imagePath ? this.pictureMaterial(card.imagePath) : this.squareBackMaterial);
        object.scale.setScalar(DRAG_SCALE);
        this.scene.add(object);
        let beam:Mesh = null;
        let start:Vector3 = null;
        if(kind === "aim"){
            beam = this.makeBeam();
            this.scene.add(beam);
            start = (from ? this.pointerPoint(from.x, from.y, 0.004) : null) || new Vector3(FIELD_X, 0.004, BOARD.maxZ);
            this.runBeam();
        }
        this.drag = {card, kind, object, target:null, beam, from:start, targets:new Set(targets)};
        this.moveDrag(x, y, ()=>false);
    }

    // Follows the pointer and finds what the card is over: the sphere (it opens), one of the player's
    // zones where canPlace allows the card (it glows), a card the spell can aim at (it glows), or the board
    moveDrag(x:number, y:number, canPlace:(row:Row, index:number)=>boolean):DropTarget{
        if(!this.drag){
            return null;
        }
        const drag = this.drag;
        const point = this.pointerPoint(x, y, DRAG_HEIGHT);
        if(!point){
            return drag.target;
        }
        drag.object.position.copy(point);
        let target:DropTarget = null;
        if(Math.hypot(point.x - this.sphere.x, point.z - this.sphere.z) < SPHERE_REACH){
            target = {kind:"sphere"};
        }
        else if(drag.kind === "summon"){
            for(const row of ["front", "back"] as Row[]){
                for(let i = 0; i < 5; i++){
                    const slot = this.slotPosition("player", row, i);
                    if(Math.abs(point.x - slot.x) < (SLOT + SLOT_GAP) / 2 && Math.abs(point.z - slot.z) < (SLOT + SLOT_GAP) / 2 && canPlace(row, i)){
                        target = {kind:"zone", row, index:i};
                    }
                }
            }
        }
        else if(drag.kind === "aim"){
            const hit = this.fieldCardAt(x, y);
            if(hit && drag.targets.has(hit.cardID)){
                target = {kind:"card", cardID:hit.cardID};
            }
        }
        else{
            const ground = this.pointerPoint(x, y, 0);
            if(ground && ground.x > BOARD.minX && ground.x < BOARD.maxX && ground.z > BOARD.minZ && ground.z < BOARD.maxZ){
                target = {kind:"board"};
            }
        }
        drag.target = target;
        this.setSphereOpen(target !== null && target.kind === "sphere");
        this.glow(target && target.kind === "zone" ? target : null);
        if(drag.kind === "aim"){
            // Near the sphere the line turns back into the card, to sacrifice it
            const overSphere = target !== null && target.kind === "sphere";
            drag.object.visible = overSphere;
            drag.beam.visible = !overSphere;
            const end = this.pointerPoint(x, y, 0.004);
            if(end){
                this.placeBeam(drag.beam, drag.from, end);
            }
            this.markPick(drag.targets, new Set(target && target.kind === "card" ? [target.cardID] : []));
        }
        return target;
    }

    // The card is let go. Over the sphere, a zone or the board, the SquareCard stays there, held, until
    // the server answers (sacrificeHeld, syncField, castHeld or cancelHeld); after aiming at a card or
    // anywhere else, it is gone. Returns the target.
    dropDrag():DropTarget{
        if(!this.drag){
            return null;
        }
        const {card, object, target, beam} = this.drag;
        this.drag = null;
        this.glow(null);
        if(beam){
            beam.removeFromParent();
            this.markPick(null, new Set());
        }
        if(!target || target.kind === "card"){
            object.removeFromParent();
            this.setSphereOpen(false);
            return target;
        }
        this.held = {cardID:card.id, object};
        return target;
    }

    // The held spell went off: it flares and fades where it was dropped
    async castHeld(){
        if(!this.held){
            return;
        }
        const object = this.held.object;
        this.held = null;
        const material = (object.getObjectByProperty("isMesh", true) as Mesh).material as MeshBasicMaterial;
        const flare = material.clone();
        flare.transparent = true;
        this.setMaterial(object, flare);
        const scale = object.scale.x;
        await this.tween(350, (t)=>{
            object.scale.setScalar(scale * (1 + 0.6 * t));
            flare.opacity = 1 - t;
        });
        object.removeFromParent();
        flare.dispose();
    }

    // A flat glowing ribbon with stripes running along it
    private makeBeam():Mesh{
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 16;
        const g = canvas.getContext("2d");
        for(let x = 0; x < 64; x++){
            const on = x % 32 < 20 ? 1 : 0.35;
            for(let y = 0; y < 16; y++){
                const edge = 1 - Math.abs(y - 7.5) / 8;
                g.fillStyle = "rgba(170, 235, 255, " + (on * edge * edge).toFixed(3) + ")";
                g.fillRect(x, y, 1, 1);
            }
        }
        const map = new CanvasTexture(canvas);
        map.wrapS = RepeatWrapping;
        const geometry = new PlaneGeometry(1, 1);
        geometry.rotateX(-Math.PI / 2);
        const beam = new Mesh(geometry, unlit({map, color:0x7fdcff, transparent:true, blending:AdditiveBlending, depthTest:false, depthWrite:false}));
        beam.renderOrder = RENDER_ORDER;
        return beam;
    }

    private placeBeam(beam:Mesh, from:Vector3, to:Vector3){
        const length = Math.max(0.001, from.distanceTo(to));
        beam.position.copy(from).add(to).multiplyScalar(0.5);
        beam.rotation.set(0, -Math.atan2(to.z - from.z, to.x - from.x), 0);
        beam.scale.set(length, 1, BEAM_WIDTH);
        ((beam.material as MeshBasicMaterial).map as Texture).repeat.x = length / 0.012;
    }

    // Keeps the line's stripes running while it is shown
    private runBeam(){
        if(this.beamFrame !== null){
            return;
        }
        const step = (now:number)=>{
            if(!this.drag || !this.drag.beam || this.stopped){
                this.beamFrame = null;
                return;
            }
            ((this.drag.beam.material as MeshBasicMaterial).map as Texture).offset.x = -(now / 1000) * BEAM_SPEED;
            this.beamFrame = requestAnimationFrame(step);
        };
        this.beamFrame = requestAnimationFrame(step);
    }

    // The server refused: the held card goes away (it is shown in the hand again)
    cancelHeld(){
        if(this.held){
            this.held.object.removeFromParent();
            this.held = null;
        }
        this.setSphereOpen(false);
    }

    private cancelDrag(){
        if(this.drag){
            this.drag.object.removeFromParent();
            if(this.drag.beam){
                this.drag.beam.removeFromParent();
                this.markPick(null, new Set());
            }
            this.drag = null;
        }
        this.glow(null);
    }

    private glow(zone:{row:Row, index:number}){
        (["front", "back"] as Row[]).forEach((row)=>{
            this.zones.player[row].forEach((mesh, i)=>{
                const on = zone !== null && zone.row === row && zone.index === i;
                this.light(mesh, on ? 1 : 0, GLOW_GOLD);
            });
        });
    }

    //zone glow-------------------------------------------------------------------------------

    private glows = new Map<Mesh, {mesh:Mesh, level:number}>();
    private glowTexture:Texture = null;
    private glowFrame:number = null;

    // Lights a zone's edge: level 0 is off, 1 full; the colour tints the glow
    private light(zone:Mesh, level:number, color:number){
        let glow = this.glows.get(zone);
        if(!glow){
            if(level <= 0){
                return;
            }
            const geometry = new PlaneGeometry(SLOT * GLOW_SIZE, SLOT * GLOW_SIZE);
            geometry.rotateX(-Math.PI / 2);
            const mesh = new Mesh(geometry, unlit({map:this.edgeTexture(), transparent:true, blending:AdditiveBlending, depthWrite:false}));
            mesh.position.copy(zone.getWorldPosition(new Vector3())).setY(0.0016);
            mesh.renderOrder = RENDER_ORDER - 1;
            this.scene.add(mesh);
            glow = {mesh, level:0};
            this.glows.set(zone, glow);
        }
        glow.level = level;
        glow.mesh.visible = level > 0;
        (glow.mesh.material as MeshBasicMaterial).color.set(color);
        if(level > 0 && this.glowFrame === null){
            this.glowFrame = requestAnimationFrame(this.shimmer);
        }
    }

    // The lit edges pulse gently while any is on
    private shimmer = (now:number)=>{
        let any = false;
        this.glows.forEach((glow)=>{
            if(glow.level > 0){
                any = true;
                (glow.mesh.material as MeshBasicMaterial).opacity = glow.level * (0.78 + 0.22 * Math.sin(now / 180));
            }
        });
        if(this.portalGlow && this.portalGlow.level > 0){
            any = true;
            (this.portalGlow.mesh.material as MeshBasicMaterial).opacity = this.portalGlow.level * (0.7 + 0.3 * Math.sin(now / 220));
        }
        this.glowFrame = any && !this.stopped ? requestAnimationFrame(this.shimmer) : null;
    }

    // A soft white rounded outline at the zone's edge, fading inwards and outwards
    private edgeTexture():Texture{
        if(this.glowTexture){
            return this.glowTexture;
        }
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const g = canvas.getContext("2d");
        const inset = size * (1 - 1 / GLOW_SIZE) / 2;
        const rect = (pad:number)=>{
            const x = inset - pad, w = size - 2 * (inset - pad), r = 10 + pad;
            g.beginPath();
            g.moveTo(x + r, x);
            g.arcTo(x + w, x, x + w, x + w, r);
            g.arcTo(x + w, x + w, x, x + w, r);
            g.arcTo(x, x + w, x, x, r);
            g.arcTo(x, x, x + w, x, r);
            g.closePath();
        };
        g.strokeStyle = "#fff";
        g.shadowColor = "#fff";
        // A wide faint halo, then a narrow bright line on the edge
        g.shadowBlur = 30;
        g.lineWidth = 16;
        g.globalAlpha = 0.7;
        rect(3);
        g.stroke();
        g.stroke();
        g.shadowBlur = 12;
        g.lineWidth = 5;
        g.globalAlpha = 1;
        rect(0);
        g.stroke();
        g.stroke();
        this.glowTexture = new CanvasTexture(canvas);
        return this.glowTexture;
    }

    //attacks and skills----------------------------------------------------------------------

    private fieldCard(side:Side, cardID:string):{card:FieldCard, row:Row, index:number}{
        for(const row of ["front", "back"] as Row[]){
            const index = this.field[side][row].findIndex(c => c && c.cardID === cardID);
            if(index >= 0){
                return {card:this.field[side][row][index], row, index};
            }
        }
        return null;
    }

    // Where a field card is on screen
    cardScreenRect(side:Side, cardID:string):DOMRect{
        const found = this.fieldCard(side, cardID);
        if(!found){
            return null;
        }
        const center = this.slotPosition(side, found.row, found.index);
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => this.toScreen(center.clone().add(new Vector3(x * SLOT / 2, 0, z * SLOT / 2))));
        const xs = corners.map(c => c.x), ys = corners.map(c => c.y);
        return new DOMRect(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    }

    // The middle of a field card on screen, where the attack line starts
    cardScreenPoint(side:Side, cardID:string):{x:number, y:number}{
        const found = this.fieldCard(side, cardID);
        return found ? this.toScreen(this.slotPosition(side, found.row, found.index)) : null;
    }

    // Whether this point of the screen is over the opponent's portal
    overPortal(x:number, y:number):boolean{
        const portal = this.portals.opponent;
        const point = portal ? this.pointerPoint(x, y, portal.y) : null;
        return !!point && Math.hypot(point.x - portal.x, point.z - portal.z) < PORTAL_REACH;
    }

    // The opponent's portal glows while it can be attacked (their field is empty, on the player's turn)
    setPortalOpen(open:boolean){
        this.portalLight(open ? GLOW_SOFT : 0);
    }

    private portalLight(level:number){
        const portal = this.portals.opponent;
        if(!portal){
            return;
        }
        if(!this.portalGlow){
            if(level <= 0){
                return;
            }
            const size = PORTAL_REACH * 2.6;
            const geometry = new PlaneGeometry(size, size);
            geometry.rotateX(-Math.PI / 2);
            const mesh = new Mesh(geometry, unlit({map:this.ringTexture(), color:GLOW_RED, transparent:true, blending:AdditiveBlending, depthTest:false, depthWrite:false}));
            mesh.position.copy(portal).setY(portal.y + 0.006);
            mesh.renderOrder = RENDER_ORDER - 1;
            this.scene.add(mesh);
            this.portalGlow = {mesh, level:0};
        }
        this.portalGlow.level = level;
        this.portalGlow.mesh.visible = level > 0;
        if(level > 0 && this.glowFrame === null){
            this.glowFrame = requestAnimationFrame(this.shimmer);
        }
    }

    // A soft glowing ring the size of the portal's rim
    private ringTexture():Texture{
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const g = canvas.getContext("2d");
        const radius = size / 2 / 1.3;
        g.strokeStyle = "#fff";
        g.shadowColor = "#fff";
        g.shadowBlur = 30;
        g.lineWidth = 18;
        g.globalAlpha = 0.7;
        g.beginPath();
        g.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
        g.stroke();
        g.stroke();
        g.shadowBlur = 12;
        g.lineWidth = 6;
        g.globalAlpha = 1;
        g.beginPath();
        g.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
        g.stroke();
        return new CanvasTexture(canvas);
    }

    // Marks what the dragged attacker is aimed at: an opponent's card, or their portal when they are
    // attacked directly; null clears it
    aimAt(target:{side:Side, cardID:string} | "player" | null){
        if(this.portalGlow && this.portalGlow.level > 0){
            this.portalLight(target === "player" ? 1 : GLOW_SOFT);
        }
        (["front", "back"] as Row[]).forEach((row)=>{
            this.zones.opponent[row].forEach((mesh, i)=>{
                const card = this.field.opponent[row][i];
                const on = !!target && target !== "player" && !!card && target.cardID === card.cardID;
                this.light(mesh, on ? 1 : 0, GLOW_RED);
            });
        });
    }

    // While the player picks cards on the field: the zones of the cards they may pick glow white, the
    // picked ones gold. null clears it.
    markPick(pickable:Set<string>, picked:Set<string>){
        (["player", "opponent"] as Side[]).forEach((side)=>{
            (["front", "back"] as Row[]).forEach((row)=>{
                this.zones[side][row].forEach((mesh, i)=>{
                    const card = this.field[side][row][i];
                    const can = !!pickable && !!card && pickable.has(card.cardID);
                    const chosen = can && picked.has(card.cardID);
                    this.light(mesh, chosen ? 1 : can ? GLOW_SOFT : 0, chosen ? GLOW_GOLD : GLOW_WHITE);
                });
            });
        });
    }

    // While a summoned card waits for its zone: the free zones it can go to glow, the one under the
    // pointer gold. null clears it.
    markZones(side:Side, zones:{row:Row, index:number}[], hovered:{row:Row, index:number}){
        (["player", "opponent"] as Side[]).forEach((s)=>{
            (["front", "back"] as Row[]).forEach((row)=>{
                this.zones[s][row].forEach((mesh, i)=>{
                    const can = !!zones && s === side && zones.some(z => z.row === row && z.index === i);
                    const on = can && !!hovered && hovered.row === row && hovered.index === i;
                    this.light(mesh, on ? 1 : can ? GLOW_SOFT : 0, on ? GLOW_GOLD : GLOW_WHITE);
                });
            });
        });
    }

    // The zone of a side's field under this point of the screen
    zoneAt(side:Side, x:number, y:number):{row:Row, index:number}{
        const point = this.pointerPoint(x, y, 0);
        if(!point){
            return null;
        }
        for(const row of ["front", "back"] as Row[]){
            for(let i = 0; i < 5; i++){
                const slot = this.slotPosition(side, row, i);
                if(Math.abs(point.x - slot.x) < (SLOT + SLOT_GAP) / 2 && Math.abs(point.z - slot.z) < (SLOT + SLOT_GAP) / 2){
                    return {row, index:i};
                }
            }
        }
        return null;
    }

    // The attacker lifts off its zone and floats there
    async liftAttacker(side:Side, cardID:string){
        const found = this.fieldCard(side, cardID);
        if(!found){
            return;
        }
        const object = found.card.object;
        const base = this.slotPosition(side, found.row, found.index);
        const from = object.position.y;
        await this.tween(220, (t)=>{object.position.copy(base).setY(from + (ATTACK_HEIGHT - from) * easeInOut(t))});
        await this.tween(180, (t)=>{object.position.copy(base).setY(ATTACK_HEIGHT + Math.sin(Math.PI * 2 * t) * 0.002)});
    }

    // The attacker slams into its target (a card, or the opponent's side when the player is attacked)
    // with a shake of the view, then goes back to its zone
    async slam(side:Side, cardID:string, target:{side:Side, cardID:string} | "player"){
        const found = this.fieldCard(side, cardID);
        if(!found){
            return;
        }
        const object = found.card.object;
        const base = this.slotPosition(side, found.row, found.index);
        if(object.position.y < ATTACK_HEIGHT / 2){
            await this.liftAttacker(side, cardID);
        }
        let point:Vector3;
        if(target === "player"){
            const other:Side = side === "player" ? "opponent" : "player";
            point = this.portals[other] ? this.portals[other].clone() : new Vector3(FIELD_X, 0, ROWS[other].back + (other === "opponent" ? -1 : 1) * SLOT);
        }
        else{
            const hit = this.fieldCard(target.side, target.cardID);
            point = hit ? this.slotPosition(target.side, hit.row, hit.index) : base.clone();
        }
        point.y = 0.004;
        const from = object.position.clone();
        await this.tween(130, (t)=>{object.position.lerpVectors(from, point, t * t)});
        this.shake();
        await wait(90);
        const back = object.position.clone();
        await this.tween(340, (t)=>{object.position.lerpVectors(back, base, easeInOut(t))});
        object.position.copy(base);
    }

    // The attack was stopped: the attacker goes back down
    async landAttacker(side:Side, cardID:string){
        const found = this.fieldCard(side, cardID);
        if(!found){
            return;
        }
        const object = found.card.object;
        const base = this.slotPosition(side, found.row, found.index);
        const from = object.position.clone();
        await this.tween(220, (t)=>{object.position.lerpVectors(from, base, easeInOut(t))});
    }

    // A skill's damage hits these cards: magical damage strikes each with lightning from the sky,
    // physical damage with three glowing arrows
    async skillDamage(kind:string, cardIDs:string[]){
        const hits = cardIDs.map((id)=>{
            const side = (["player", "opponent"] as Side[]).find(s => this.fieldCard(s, id));
            return side ? {side, id} : null;
        }).filter(h => h);
        if(hits.length === 0){
            return;
        }
        if(kind === "magical"){
            this.shake(LIGHTNING_SHAKE, 300);
        }
        await Promise.all(hits.map(h => kind === "magical" ? this.lightning(h.side, h.id) : this.arrows(h.side, h.id)));
    }

    // A blue bolt strikes once from the top of the screen onto the card, with a flash where it hits, and fades
    private async lightning(side:Side, cardID:string){
        const found = this.fieldCard(side, cardID);
        const zone = this.zones[side][found.row][found.index];
        const target = this.slotPosition(side, found.row, found.index).setY(0.002);
        // The camera looks down on the board from the player's side: far away and high up is the top of the screen
        const start = target.clone().add(new Vector3((Math.random() - 0.5) * 0.04, 0.12, -0.16));
        // The strips are seen from either side, depending on which way the bolt runs
        const effect = {transparent:true, blending:AdditiveBlending, depthTest:false, depthWrite:false, side:DoubleSide};
        const glow = unlit({map:this.boltTexture(), color:0x2f6dff, ...effect});
        const core = unlit({map:this.boltTexture(), color:0xe4f4ff, ...effect});
        const flash = new Mesh(new PlaneGeometry(SLOT * 2.4, SLOT * 2.4).rotateX(-Math.PI / 2), unlit({map:this.burstTexture(), color:0x6fb2ff, ...effect}));
        flash.position.copy(target);
        flash.renderOrder = RENDER_ORDER + 1;
        this.scene.add(flash);
        const bolt:Mesh[] = [];
        this.boltPaths(start, target).forEach((path, i)=>{
            const scale = i === 0 ? 1 : 0.55;
            [[glow, BOLT_GLOW], [core, BOLT_CORE]].forEach(([material, width]:[Material, number])=>{
                const mesh = new Mesh(this.ribbon(path, width * scale), material);
                mesh.renderOrder = RENDER_ORDER + 2;
                this.scene.add(mesh);
                bolt.push(mesh);
            });
        });
        await this.tween(LIGHTNING_TIME, (t)=>{
            // Full strength for the first moment, then gone
            const level = t < 0.2 ? 1 : Math.pow((1 - t) / 0.8, 2);
            glow.opacity = core.opacity = level;
            (flash.material as MeshBasicMaterial).opacity = Math.min(1, (1 - t) * 1.6);
            flash.scale.setScalar(0.7 + 0.5 * t);
            this.light(zone, level, 0x6fb2ff);
        });
        bolt.forEach((m)=>{this.scene.remove(m); m.geometry.dispose()});
        this.scene.remove(flash);
        flash.geometry.dispose();
        [glow, core, flash.material as Material].forEach(m => m.dispose());
        this.light(zone, 0, 0x6fb2ff);
    }

    // The bolt from start to end, and a short fork off its upper half
    private boltPaths(start:Vector3, end:Vector3):Vector3[][]{
        const path = (from:Vector3, to:Vector3, steps:number, jag:number)=>{
            const points = [from.clone()];
            for(let i = 1; i < steps; i++){
                const p = from.clone().lerp(to, i / steps);
                p.x += (Math.random() - 0.5) * jag;
                p.z += (Math.random() - 0.5) * jag;
                points.push(p);
            }
            points.push(to.clone());
            return points;
        };
        const main = path(start, end, 14, 0.012);
        const at = main[3 + Math.floor(Math.random() * 4)];
        const fork = at.clone().lerp(end, 0.35).add(new Vector3((Math.random() < 0.5 ? -1 : 1) * 0.018, 0, 0.004));
        return [main, path(at, fork, 5, 0.008)];
    }

    // A strip along the points, "width" wide and turned to the camera; the texture runs across it
    private ribbon(points:Vector3[], width:number):BufferGeometry{
        const eye = this.camera.getWorldPosition(new Vector3());
        const positions:number[] = [], uvs:number[] = [], index:number[] = [];
        points.forEach((p, i)=>{
            const along = points[Math.min(i + 1, points.length - 1)].clone().sub(points[Math.max(i - 1, 0)]);
            const across = along.cross(eye.clone().sub(p)).normalize().multiplyScalar(width / 2);
            const a = p.clone().add(across), b = p.clone().sub(across);
            positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
            uvs.push(i / (points.length - 1), 0, i / (points.length - 1), 1);
            if(i > 0){
                const k = i * 2;
                index.push(k - 2, k - 1, k, k - 1, k + 1, k);
            }
        });
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
        geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
        geometry.setIndex(index);
        return geometry;
    }

    // Three glowing arrows fly in from the other side one after another and stick in the card, which
    // shakes as each hits; then they fade away
    private async arrows(side:Side, cardID:string){
        const found = this.fieldCard(side, cardID);
        const object = found.card.object;
        const origin = object.position.clone();
        const target = this.slotPosition(side, found.row, found.index);
        // From the opponent's side for the player's cards, and the other way round
        const facing = side === "player" ? -Math.PI / 2 : Math.PI / 2;
        const effect = {transparent:true, blending:AdditiveBlending, depthTest:false, depthWrite:false};
        const material = unlit({map:this.arrowTexture(), color:0xffc85a, ...effect});
        const arrows:Mesh[] = [];
        const shoot = async (k:number)=>{
            await wait(k * ARROW_GAP);
            const angle = facing + (k - 1) * 0.45 + (Math.random() - 0.5) * 0.2;
            // Where it flies: towards the card's middle, from the direction of the angle
            const toward = new Vector3(-Math.cos(angle), 0, -Math.sin(angle));
            const tip = target.clone().add(new Vector3((k - 1) * 0.006, 0.003, (Math.random() - 0.5) * 0.008));
            const end = tip.clone().addScaledVector(toward, -ARROW_LENGTH * 0.38);
            const begin = end.clone().addScaledVector(toward, -0.1).setY(0.05);
            const arrow = new Mesh(new PlaneGeometry(ARROW_LENGTH, ARROW_LENGTH / 4).rotateX(-Math.PI / 2), material);
            arrow.rotation.y = -Math.atan2(toward.z, toward.x);
            arrow.renderOrder = RENDER_ORDER + 2;
            this.scene.add(arrow);
            arrows.push(arrow);
            await this.tween(ARROW_FLIGHT, (t)=>{arrow.position.lerpVectors(begin, end, t * t)});
            // A gold spark where it hits, while the card shakes
            const spark = new Mesh(new PlaneGeometry(SLOT * 0.9, SLOT * 0.9).rotateX(-Math.PI / 2), unlit({map:this.burstTexture(), color:0xffb040, ...effect}));
            spark.position.copy(tip);
            spark.renderOrder = RENDER_ORDER + 1;
            this.scene.add(spark);
            await this.tween(160, (t)=>{
                const strength = ARROW_SHAKE * (1 - t);
                object.position.set(origin.x + (Math.random() - 0.5) * strength, origin.y, origin.z + (Math.random() - 0.5) * strength);
                (spark.material as MeshBasicMaterial).opacity = 1 - t;
                spark.scale.setScalar(0.6 + 0.8 * t);
            });
            object.position.copy(origin);
            this.scene.remove(spark);
            spark.geometry.dispose();
            (spark.material as Material).dispose();
        };
        await Promise.all([0, 1, 2].map(shoot));
        await wait(140);
        await this.tween(150, (t)=>{material.opacity = 1 - t});
        arrows.forEach((a)=>{this.scene.remove(a); a.geometry.dispose()});
        material.dispose();
    }

    private textures:Record<string, Texture> = {};

    // Soft across its width, bright in the middle: the bolt's strips
    private boltTexture():Texture{
        return this.textures.bolt || (this.textures.bolt = this.canvasTexture(4, 64, false, (g)=>{
            const gradient = g.createLinearGradient(0, 0, 0, 64);
            gradient.addColorStop(0, "rgba(255,255,255,0)");
            gradient.addColorStop(0.5, "rgba(255,255,255,1)");
            gradient.addColorStop(1, "rgba(255,255,255,0)");
            g.fillStyle = gradient;
            g.fillRect(0, 0, 4, 64);
        }));
    }

    // A round glow, for the flash where the bolt hits
    private burstTexture():Texture{
        return this.textures.burst || (this.textures.burst = this.canvasTexture(128, 128, false, (g)=>{
            const gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64);
            gradient.addColorStop(0, "rgba(255,255,255,1)");
            gradient.addColorStop(0.25, "rgba(255,255,255,0.6)");
            gradient.addColorStop(1, "rgba(255,255,255,0)");
            g.fillStyle = gradient;
            g.fillRect(0, 0, 128, 128);
        }));
    }

    // An arrow pointing right (+x), glowing: shaft, head and fletching
    private arrowTexture():Texture{
        // The arrow along the middle line, with room for its glow
        return this.textures.arrow || (this.textures.arrow = this.canvasTexture(256, 64, false, (g)=>{
            g.strokeStyle = g.fillStyle = g.shadowColor = "#fff";
            g.lineCap = "round";
            for(const [blur, width, alpha] of [[22, 10, 0.45], [10, 5, 0.8], [2, 2.5, 1]]){
                g.shadowBlur = blur;
                g.globalAlpha = alpha;
                g.lineWidth = width;
                g.beginPath();
                g.moveTo(24, 32);
                g.lineTo(224, 32);
                // Fletching
                g.moveTo(12, 22);
                g.lineTo(36, 32);
                g.lineTo(12, 42);
                g.stroke();
                g.beginPath();
                g.moveTo(250, 32);
                g.lineTo(218, 20);
                g.lineTo(226, 32);
                g.lineTo(218, 44);
                g.closePath();
                g.fill();
            }
        }));
    }

    // colored: the picture's own colours show as drawn (the others are white, tinted by their material)
    private canvasTexture(width:number, height:number, colored:boolean, draw:(g:CanvasRenderingContext2D)=>void):Texture{
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        draw(canvas.getContext("2d"));
        const texture = new CanvasTexture(canvas);
        if(colored){
            texture.encoding = sRGBEncoding;
        }
        return texture;
    }

    // The whole play area shakes for a moment
    private shake(power = 0.0025, duration = 260){
        const scene = this.scene;
        const origin = scene.position.clone();
        this.tween(duration, (t)=>{
            const strength = power * (1 - t);
            scene.position.set(origin.x + (Math.random() - 0.5) * strength, origin.y + (Math.random() - 0.5) * strength, origin.z + (Math.random() - 0.5) * strength);
        }).then(()=>{scene.position.copy(origin)});
    }

    // A face-down card whose skill goes off (a trap) turns face up, showing "card"
    async reveal(side:Side, card:GameCard){
        const found = this.fieldCard(side, card.id);
        if(!found || found.card.look !== "back" || !isKnown(card)){
            return;
        }
        this.setLook(found.card, {...card, isHidden:false});
        await wait(460);
    }

    // A card whose skill goes off pulses on its zone, which glows gold
    async flash(side:Side, cardID:string){
        const found = this.fieldCard(side, cardID);
        if(!found){
            return;
        }
        const object = found.card.object;
        const zone = this.zones[side][found.row][found.index];
        await this.tween(700, (t)=>{
            const pulse = Math.abs(Math.sin(Math.PI * 2 * t));
            object.scale.setScalar(1 + 0.15 * pulse);
            this.light(zone, Math.max(0.05, pulse), GLOW_GOLD);
        });
        object.scale.setScalar(1);
        this.light(zone, 0, GLOW_GOLD);
    }

    private toScreen(point:Vector3):{x:number, y:number}{
        const view = this.engine.mount.getBoundingClientRect();
        this.camera.updateMatrixWorld();
        const v = point.clone().project(this.camera);
        return {x:view.left + (v.x + 1) / 2 * view.width, y:view.top + (1 - v.y) / 2 * view.height};
    }

    //helpers---------------------------------------------------------------------------------

    private square(material:Material):Object3D{
        const object = this.squareTemplate.clone(true);
        this.setMaterial(object, material);
        return object;
    }

    // The card's own meshes take the material; the marks on it keep theirs
    private setMaterial(object:Object3D, material:Material){
        object.traverse((o)=>{
            if((o as Mesh).isMesh && !o.userData.mark){
                (o as Mesh).material = material;
            }
        });
    }

    private texture(canvas:HTMLCanvasElement):CanvasTexture{
        const texture = new CanvasTexture(canvas);
        texture.flipY = false;
        texture.encoding = sRGBEncoding;
        return texture;
    }

    // Runs update(t) every frame for t from 0 to 1; resolves at 1
    private tween(duration:number, update:(t:number)=>void):Promise<void>{
        if(this.stopped){
            return Promise.resolve();
        }
        return new Promise((resolve)=>{
            this.tweens.push({start:performance.now(), duration, update, done:resolve});
            if(this.frame === null){
                this.frame = requestAnimationFrame(this.animate);
            }
        });
    }

    private animate = (now:number)=>{
        this.tweens = this.tweens.filter((tween)=>{
            const t = Math.min(1, (now - tween.start) / tween.duration);
            tween.update(t);
            if(t >= 1){
                tween.done();
                return false;
            }
            return true;
        });
        this.frame = this.tweens.length > 0 ? requestAnimationFrame(this.animate) : null;
    }

    // The point at this height above the board under a point of the screen
    private pointerPoint(x:number, y:number, height:number):Vector3{
        const view = this.engine.mount.getBoundingClientRect();
        const ndc = new Vector2(((x - view.left) / view.width) * 2 - 1, -(((y - view.top) / view.height) * 2 - 1));
        const ray = new Raycaster();
        this.camera.updateMatrixWorld();
        ray.setFromCamera(ndc, this.camera);
        return ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -height), new Vector3());
    }

    // The board point under the middle of a part of the screen
    private screenPoint(rect:DOMRect):Vector3{
        return rect ? this.pointerPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, DRAG_HEIGHT) : null;
    }

    // Where the card has to be to cover this part of the screen exactly, facing the camera
    private screenPose(rect:DOMRect, faceUp:boolean):{position:Vector3, rotation:Quaternion}{
        if(!rect || rect.height <= 0){
            return null;
        }
        const camera = this.camera;
        const view = this.engine.mount.getBoundingClientRect();
        camera.updateMatrixWorld();
        const tan = Math.tan(Number(camera.fov) * Math.PI / 360);
        // The distance from the camera at which the card is as tall on screen as the rect
        const distance = this.cardLength * view.height / (2 * tan * rect.height);
        const x = ((rect.left + rect.width / 2 - view.left) / view.width) * 2 - 1;
        const y = -(((rect.top + rect.height / 2 - view.top) / view.height) * 2 - 1);
        const rotation = camera.getWorldQuaternion(new Quaternion());
        const position = new Vector3(x * distance * tan * camera.aspect, y * distance * tan, -distance)
            .applyQuaternion(rotation)
            .add(camera.getWorldPosition(new Vector3()));
        return {position, rotation:rotation.multiply(faceUp ? FACING_CAMERA : BACK_TO_CAMERA)};
    }
}

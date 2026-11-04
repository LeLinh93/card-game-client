import {
    AdditiveBlending, Box3, BufferGeometry, CanvasTexture, Color, DoubleSide, Euler, Float32BufferAttribute, Material, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Plane, PlaneGeometry,
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
// The sphere's two halves (Sphere, Sphere001) open and close under it; "Sphere_gizmo" has no meshes
const SPHERE = "gate_gizmo";
// Each player's portal, in the corner of their side: an attacker dropped on the opponent's attacks
// them directly, once their field is empty
const PORTALS = {player:"Av1", opponent:"Av"};
const PORTAL_REACH = 0.024;
// The "24" next to each deck: 3D text, replaced by a counter of the side's resources
const COUNTERS = {player:"Text001", opponent:"Text"};
const COUNTER_FACES = {player:"polySurface20001", opponent:"polySurface20"};
// Each player's tombstone, by their deck: clicking it shows their graveyard
const TOMBSTONES = {player:"Graveyard001", opponent:"Graveyard"};

// The SquareCard model is drawn this many times its size, and the field's zones with it. 1.3 is
// about the most the back rows take: they lie between the portraits (x up to -0.107) and the decks
// (x from 0.088), 0.195 m, and five slots at 1.5 would be 0.198 m without any gap.
const SQUARE_SCALE = 1.2;
// The field, in m: 5 slots per row, numbered 0 to 4 from left to right as the player sees them
const SLOT = 0.0264 * SQUARE_SCALE;
const SLOT_GAP = 0.003 * SQUARE_SCALE;
// Centred between the portraits and the decks, so the back rows stay clear of both
const FIELD_X = -0.0096;
// The rows spread out from the middle line between the two sides, level with the sphere
const FIELD_MIDDLE = -0.0165;
const ROWS = {
    player:{front:FIELD_MIDDLE + 0.0195 * SQUARE_SCALE, back:FIELD_MIDDLE + 0.0505 * SQUARE_SCALE},
    opponent:{front:FIELD_MIDDLE - 0.0195 * SQUARE_SCALE, back:FIELD_MIDDLE - 0.0505 * SQUARE_SCALE},
};
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
// A card going to the graveyard: a blue comet flies to the tombstone. Its head's size, its tail's
// width and length (as a part of the flight), how high it arcs (m) and how long it flies (ms)
const COMET_SIZE = 0.012;
const COMET_WIDTH = 0.005;
const COMET_TAIL = 0.4;
const COMET_ARC = 0.035;
const COMET_TIME = 520;
const COMET_COLOR = 0x5fc4ff;

const DRAW_TIME = 550;
const PLACE_TIME = 380;
// How high a drawn card lifts off the deck, in m
const DRAW_ARC = 0.03;
// Drawn above everything else in the scene
const RENDER_ORDER = 1000;
// The engine blends in linear light, so a white this transparent looks like about 20% white on screen
// (measured over the board: 0.045 brings it from about 40 to 79 of 255)
const ZONE_OPACITY = 0.045;
// A highlighted zone gets a thin glowing edge (a ring a little bigger than the zone, pulsing gently)
const GLOW_SIZE = 1.2;
const GLOW_WHITE = 0xbfe9ff;
// The zone a dragged card would go to
const GLOW_BLUE = 0x4fa8ff;
const GLOW_GOLD = 0xffc65a;
const GLOW_RED = 0xff4a3a;
const GLOW_SOFT = 0.5;
// Marks on field cards: how dark a card that can't attack gets (the engine blends in linear light,
// so this looks like about 40% darker on screen)
const DIM_OPACITY = 0.65;
// The hero glow's plane, as many times the card's size: room for the halo outside the border
const HERO_GLOW_SIZE = 1.25;
// A card whose skill goes off blinks once (ms), a thin blue glow round its border
const FLASH_TIME = 450;
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
// diamond in its top left corner while its Active skill can be used, a thin gold border, and its
// kind's symbol in the top right corner
type Mark = "hero" | "dim" | "active" | "border" | "symbol";
// The symbols: a white pawn for a unit, a white rook for a structure, a gold crown for a hero
type CardSymbol = "pawn" | "rook" | "crown";

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
    // Whether a card over the sphere or going into it wants it open, and how many banish comets are
    // flying into it: it stays open while either does
    private sphereWanted = false;
    private banishing = 0;
    private portals:Record<Side, Vector3> = {player:null, opponent:null};
    // The middle of each tombstone, where the comets go
    private tombstones:Record<Side, Vector3> = {player:null, opponent:null};
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
    private markMaterials:Record<Exclude<Mark, "symbol">, MeshBasicMaterial> = null;
    private symbolMaterials:Record<CardSymbol, MeshBasicMaterial> = null;
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
        // Scaled inside, as the cards' own scale is set by the animations (1 when still)
        squareTemplate.children.forEach((child)=>{
            child.scale.multiplyScalar(SQUARE_SCALE);
            child.position.multiplyScalar(SQUARE_SCALE);
        });
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
            const tombstone = this.scene.getObjectByName(TOMBSTONES[side]);
            this.tombstones[side] = tombstone ? new Box3().setFromObject(tombstone).getCenter(new Vector3()) : null;
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
            look = card.imagePath + (stats ? "|" + [stats.attack, stats.defense, stats.health].join("/") : "") + (card.negated ? "|negated" : "");
            draw = stats || card.negated ? ()=>fieldSquareCanvas(card.imagePath, stats, !!card.negated) : ()=>squareCanvas(card.imagePath);
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

    //graveyards------------------------------------------------------------------------------

    // Whose tombstone is at this point of the screen, if any
    tombstoneAt(x:number, y:number):Side{
        const view = this.engine.mount.getBoundingClientRect();
        const ray = new Raycaster();
        this.camera.updateMatrixWorld();
        ray.setFromCamera(new Vector2(((x - view.left) / view.width) * 2 - 1, -(((y - view.top) / view.height) * 2 - 1)), this.camera);
        return (Object.keys(TOMBSTONES) as Side[]).find((side)=>{
            const tombstone = this.scene.getObjectByName(TOMBSTONES[side]);
            return tombstone && ray.intersectObject(tombstone, true).length > 0;
        }) || null;
    }

    // A card went to its owner's graveyard, or was banished: a comet flies from where the card was (a
    // field card on either side, the owner's hand (handRect: the card in it), their tombstone or their
    // deck) to the owner's tombstone, or into the sphere, which opens its mouth for it. Call it before
    // the field drops the card, which takes where it was at once; the flight starts after delay (ms).
    toPile(pile:"graveyard" | "banish", owner:Side, cardID:string, from:"field" | "hand" | "graveyard" | "deck", handRect:DOMRect = null, delay = 0):Promise<void>{
        const end = pile === "graveyard" ? this.tombstones[owner] : this.sphere;
        if(this.stopped || !end){
            return Promise.resolve();
        }
        let start:Vector3 = null;
        if(from === "field"){
            const found = this.fieldCard("player", cardID) || this.fieldCard("opponent", cardID);
            start = found ? found.card.object.position.clone().setY(0.004) : null;
        }
        else if(from === "hand"){
            start = this.screenPoint(handRect || this.handArea(owner));
        }
        else if(from === "graveyard" && this.tombstones[owner]){
            start = this.tombstones[owner].clone();
        }
        start = start || this.decks[owner].clone();
        if(pile === "graveyard"){
            return wait(delay).then(()=>this.comet(start, end.clone()));
        }
        // Into the mouth, a little above the sphere's middle; it closes once the last comet is in
        return wait(delay).then(async ()=>{
            this.banishing++;
            this.updateSphere();
            await this.comet(start, end.clone().setY(end.y + 0.004));
            this.banishing--;
            this.updateSphere();
        });
    }

    // A glowing blue ball with a fading tail arcs from start to end, and flares out there
    private async comet(start:Vector3, end:Vector3){
        if(this.stopped){
            return;
        }
        const effect = {transparent:true, blending:AdditiveBlending, depthTest:false, depthWrite:false, side:DoubleSide};
        const headMaterial = unlit({map:this.burstTexture(), color:COMET_COLOR, ...effect});
        const coreMaterial = unlit({map:this.burstTexture(), color:0xeaf8ff, ...effect});
        const tailMaterial = unlit({map:this.boltTexture(), vertexColors:true, ...effect});
        const head = new Mesh(new PlaneGeometry(COMET_SIZE, COMET_SIZE), headMaterial);
        const core = new Mesh(new PlaneGeometry(COMET_SIZE * 0.4, COMET_SIZE * 0.4), coreMaterial);
        head.add(core);
        head.renderOrder = RENDER_ORDER + 3;
        core.renderOrder = RENDER_ORDER + 4;
        const tail = new Mesh(new BufferGeometry(), tailMaterial);
        tail.renderOrder = RENDER_ORDER + 2;
        tail.frustumCulled = false;
        this.scene.add(head, tail);
        // Along the flight (0 to 1), eased, with an arc over the board
        const at = (s:number)=>{
            const e = easeInOut(Math.min(1, Math.max(0, s)));
            const p = start.clone().lerp(end, e);
            p.y += Math.sin(Math.PI * e) * COMET_ARC;
            return p;
        };
        const facing = this.camera.getWorldQuaternion(new Quaternion());
        // The head flies to the tombstone, then the tail catches up while the head flares out
        await this.tween(COMET_TIME * (1 + COMET_TAIL), (t)=>{
            const s = t * (1 + COMET_TAIL);
            head.position.copy(at(s));
            head.quaternion.copy(facing);
            if(s > 1){
                const flare = (s - 1) / COMET_TAIL;
                head.scale.setScalar(1 + 1.5 * flare);
                headMaterial.opacity = coreMaterial.opacity = 1 - flare;
            }
            const from = Math.max(0, s - COMET_TAIL), to = Math.min(1, s);
            tail.geometry.dispose();
            if(to - from > 0.01){
                const points:Vector3[] = [];
                for(let i = 0; i <= 12; i++){
                    points.push(at(from + (to - from) * i / 12));
                }
                tail.geometry = this.ribbon(points, COMET_WIDTH, COMET_COLOR);
            }
            else{
                tail.geometry = new BufferGeometry();
            }
        });
        this.scene.remove(head, tail);
        [head.geometry, core.geometry, tail.geometry].forEach(g => g.dispose());
        [headMaterial, coreMaterial, tailMaterial].forEach(m => m.dispose());
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

    // Every field card has the gold border; face-up units, heroes and structures show their symbol.
    // Heroes glow gold on both sides; the player's units and structures that can't attack are
    // dimmed (not those with no attack, which never can), and on their turn their cards whose
    // Active skill can be used get the diamond
    private setMarks(side:Side, fieldCard:FieldCard, card:GameCard){
        fieldCard.card = card;
        const shown = !card.isHidden && isKnown(card);
        const mine = side === "player" && shown;
        const symbol:CardSymbol = !shown ? null : card.hero ? "crown" : card.type === "unit" ? "pawn" : card.type === "structure" ? "rook" : null;
        this.showMark(fieldCard, "border", true);
        this.showMark(fieldCard, "symbol", symbol !== null);
        if(symbol){
            fieldCard.marks.symbol.material = this.symbolMaterials[symbol];
        }
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
        if((mark === "hero" || mark === "active") && this.markFrame === null){
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
                border:unlit({map:this.borderTexture(), transparent:true, depthTest:false, depthWrite:false}),
            };
            const symbol = (texture:Texture) => unlit({map:texture, transparent:true, depthTest:false, depthWrite:false});
            this.symbolMaterials = {pawn:symbol(this.pawnTexture()), rook:symbol(this.rookTexture()), crown:symbol(this.crownTexture())};
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
        else if(mark === "border"){
            geometry = new PlaneGeometry(size, size);
            position = new Vector3(0, this.squareTop + 0.0001, 0);
        }
        else if(mark === "symbol"){
            const w = size * 0.22;
            geometry = new PlaneGeometry(w, w);
            position = new Vector3(size / 2 - w * 0.7, this.squareTop + 0.0004, -size / 2 + w * 0.7);
        }
        else{
            const w = size * 0.4;
            geometry = new PlaneGeometry(w, w);
            position = new Vector3(-size / 2 + w * 0.4, this.squareTop + 0.0004, -size / 2 + w * 0.45);
        }
        geometry.rotateX(-Math.PI / 2);
        const mesh = new Mesh(geometry, mark === "symbol" ? this.symbolMaterials.pawn : this.markMaterials[mark]);
        mesh.position.copy(position);
        // The border under the dark layer, the symbols and the diamond over it
        mesh.renderOrder = {hero:RENDER_ORDER - 1, border:1, dim:2, symbol:3, active:3}[mark];
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

    // A thin gold line just inside the card's edge, in the gold of the hand cards' frame (much thinner)
    private borderTexture():Texture{
        const size = 512;
        return this.textures.border || (this.textures.border = this.canvasTexture(size, size, true, (g)=>{
            const gold = g.createLinearGradient(0, 0, 0, size);
            gold.addColorStop(0, "#d8b98c");
            gold.addColorStop(0.5, "#a87d56");
            gold.addColorStop(1, "#c19e76");
            g.strokeStyle = gold;
            g.lineWidth = 4;
            const x = 4, w = size - 8, r = 18;
            g.beginPath();
            g.moveTo(x + r, x);
            g.arcTo(x + w, x, x + w, x + w, r);
            g.arcTo(x + w, x + w, x, x + w, r);
            g.arcTo(x, x + w, x, x, r);
            g.arcTo(x, x, x + w, x, r);
            g.closePath();
            g.stroke();
        }));
    }

    // The card kinds' symbols, simple shapes filled (white, or gold for the crown) with a dark
    // shadow under them so they show on any picture
    private symbolTexture(name:string, fill:(g:CanvasRenderingContext2D)=>string | CanvasGradient, shape:(g:CanvasRenderingContext2D)=>void):Texture{
        return this.textures[name] || (this.textures[name] = this.canvasTexture(128, 128, true, (g)=>{
            g.fillStyle = fill(g);
            g.shadowColor = "rgba(0,0,0,0.85)";
            g.shadowBlur = 8;
            g.shadowOffsetY = 2;
            g.beginPath();
            shape(g);
            g.fill();
        }));
    }

    // A pawn: round head, collar and a flared body on a base
    private pawnTexture():Texture{
        return this.symbolTexture("pawn", () => "#ffffff", (g)=>{
            g.arc(64, 34, 15, 0, Math.PI * 2);
            g.moveTo(44, 54);
            g.lineTo(84, 54);
            g.lineTo(80, 62);
            g.lineTo(74, 62);
            g.quadraticCurveTo(76, 84, 90, 94);
            g.lineTo(38, 94);
            g.quadraticCurveTo(52, 84, 54, 62);
            g.lineTo(48, 62);
            g.closePath();
            g.rect(32, 98, 64, 12);
        });
    }

    // A rook: a battlement of three merlons on a tower, on a base
    private rookTexture():Texture{
        return this.symbolTexture("rook", () => "#ffffff", (g)=>{
            g.moveTo(34, 20);
            g.lineTo(48, 20);
            g.lineTo(48, 30);
            g.lineTo(57, 30);
            g.lineTo(57, 20);
            g.lineTo(71, 20);
            g.lineTo(71, 30);
            g.lineTo(80, 30);
            g.lineTo(80, 20);
            g.lineTo(94, 20);
            g.lineTo(94, 46);
            g.lineTo(84, 52);
            g.lineTo(86, 92);
            g.lineTo(42, 92);
            g.lineTo(44, 52);
            g.lineTo(34, 46);
            g.closePath();
            g.rect(32, 96, 64, 14);
        });
    }

    // A crown: three points with a ball on each, over a band
    private crownTexture():Texture{
        return this.symbolTexture("crown", (g)=>{
            const gold = g.createLinearGradient(0, 24, 0, 104);
            gold.addColorStop(0, "#fff0b8");
            gold.addColorStop(0.5, "#f5c94f");
            gold.addColorStop(1, "#c98a1c");
            return gold;
        }, (g)=>{
            g.moveTo(26, 86);
            g.lineTo(22, 42);
            g.lineTo(44, 64);
            g.lineTo(64, 32);
            g.lineTo(84, 64);
            g.lineTo(106, 42);
            g.lineTo(102, 86);
            g.closePath();
            g.rect(26, 92, 76, 14);
            [[22, 38], [64, 26], [106, 38]].forEach(([x, y])=>{
                g.moveTo(x + 7, y);
                g.arc(x, y, 7, 0, Math.PI * 2);
            });
        });
    }

    // A very thin gold line on the card's border with a soft orange halo outside it; nothing inside the card
    private heroGlowTexture():Texture{
        return this.edgeGlowTexture("hero", "#ffe3a0", "#ffb347", "#ff8a1e");
    }

    // The same thin line in light blue with a blue halo, for a card whose skill goes off
    private skillGlowTexture():Texture{
        return this.edgeGlowTexture("skill", "#e0f4ff", "#7cc8ff", "#2f8cff");
    }

    // A very thin line on the card's border (with a tight glow of lineGlow) and a soft halo outside it;
    // nothing inside the card. For a plane HERO_GLOW_SIZE times the card's size.
    private edgeGlowTexture(name:string, line:string, lineGlow:string, halo:string):Texture{
        const size = 512;
        return this.textures[name] || (this.textures[name] = this.canvasTexture(size, size, true, (g)=>{
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
            g.strokeStyle = g.shadowColor = halo;
            g.shadowBlur = 14;
            g.globalAlpha = 0.65;
            g.lineWidth = 2;
            rect(1);
            g.stroke();
            g.stroke();
            g.strokeStyle = line;
            g.shadowColor = lineGlow;
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
        this.sphereWanted = open;
        this.updateSphere();
    }

    private updateSphere(){
        const open = this.sphereWanted || this.banishing > 0;
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
                this.light(mesh, on ? 1 : 0, GLOW_BLUE);
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
        // A tight faint halo, then a narrow bright line on the edge
        g.shadowBlur = 10;
        g.lineWidth = 6;
        g.globalAlpha = 0.6;
        rect(2);
        g.stroke();
        g.stroke();
        g.shadowBlur = 5;
        g.lineWidth = 3;
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

    // A strip along the points, "width" wide and turned to the camera; the texture runs across it.
    // With a fade colour, it is a tail: thin and dark at the first point, full and that colour at the last.
    private ribbon(points:Vector3[], width:number, fade:number = null):BufferGeometry{
        const eye = this.camera.getWorldPosition(new Vector3());
        const positions:number[] = [], uvs:number[] = [], colors:number[] = [], index:number[] = [];
        const color = fade === null ? null : new Color(fade);
        points.forEach((p, i)=>{
            const u = i / (points.length - 1);
            const along = points[Math.min(i + 1, points.length - 1)].clone().sub(points[Math.max(i - 1, 0)]);
            const across = along.cross(eye.clone().sub(p)).normalize().multiplyScalar(width / 2 * (color ? 0.25 + 0.75 * u : 1));
            const a = p.clone().add(across), b = p.clone().sub(across);
            positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
            uvs.push(u, 0, u, 1);
            if(color){
                const c = color.clone().multiplyScalar(u * u);
                colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
            }
            if(i > 0){
                const k = i * 2;
                index.push(k - 2, k - 1, k, k - 1, k + 1, k);
            }
        });
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
        geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
        if(color){
            geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
        }
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

    // A card whose skill goes off blinks once: it swells a little with a thin blue glow round its border
    async flash(side:Side, cardID:string){
        const found = this.fieldCard(side, cardID);
        if(!found){
            return;
        }
        const object = found.card.object;
        const size = this.squareSize * HERO_GLOW_SIZE;
        const material = unlit({map:this.skillGlowTexture(), transparent:true, blending:AdditiveBlending, depthWrite:false, opacity:0});
        const glow = new Mesh(new PlaneGeometry(size, size).rotateX(-Math.PI / 2), material);
        glow.position.y = 0.0012;
        glow.renderOrder = RENDER_ORDER - 1;
        // Not part of the card: it keeps its material and isn't hit by the pointer
        glow.userData.mark = true;
        glow.raycast = ()=>{};
        object.add(glow);
        await this.tween(FLASH_TIME, (t)=>{
            const pulse = Math.sin(Math.PI * t);
            object.scale.setScalar(1 + 0.08 * pulse);
            material.opacity = pulse;
        });
        object.scale.setScalar(1);
        glow.removeFromParent();
        glow.geometry.dispose();
        material.dispose();
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

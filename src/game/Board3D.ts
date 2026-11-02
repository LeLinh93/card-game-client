import {
    Box3, CanvasTexture, Euler, Material, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Plane, PlaneGeometry,
    Quaternion, Raycaster, sRGBEncoding, Texture, Vector2, Vector3
} from "three";
import {Engine3D} from "./Engine3D";
import {cardCanvas, squareCanvas, squareFrom} from "./cardTexture";
import {CardFace} from "../components/CardView";
import {GameCard, isKnown} from "./protocol";

// Assets of the threngine project
const CARD_GEOMETRY = "75lh4pn8";    // "cardGame": the meshes Card_Front and Card_Back
const SQUARE_GEOMETRY = "ztthtet7";    // "SquareCard": a card on the field, showing its picture
const CARD_BACK_MATERIAL = "b0g6q05i";    // "card_border", the back the decks show
// "Door Close" opens the sphere played backwards (0) and closes it forwards (1); the scene loads closed
const SPHERE_ANIMATION = "f0p48svl";
// Objects of the play area: the player sits on the near side
const DECKS = {player:"Deck1", opponent:"Deck"};
const SPHERE = "Sphere_gizmo";
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

const DRAW_TIME = 550;
const PLACE_TIME = 380;
// How high a drawn card lifts off the deck, in m
const DRAW_ARC = 0.03;
// Drawn above everything else in the scene
const RENDER_ORDER = 1000;
// The engine blends in linear light, so a white this transparent looks like about 20% white on screen
// (measured over the board: 0.045 brings it from about 40 to 79 of 255)
const ZONE_OPACITY = 0.045;
const ZONE_GLOW_OPACITY = 0.75;
// A glowing zone grows, so it shows around the dragged card above it
const ZONE_GLOW_SCALE = 1.3;

export type Side = "player" | "opponent";
export type Row = "front" | "back";
export type DropTarget = {kind:"sphere"} | {kind:"zone", row:Row, index:number} | null;

interface Tween{
    start:number;
    duration:number;
    update:(t:number)=>void;
    done:()=>void;
}

interface FieldCard{
    cardID:string;
    // What its picture shows: the card's picture, or its back while face down
    look:string;
    object:Object3D;
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
    private squareMaterials = new Map<string, Material>();
    // The card's length in m, which the hand card's height matches when it lands
    private cardLength:number;
    private decks:Record<Side, Vector3> = {player:null, opponent:null};
    private sphere:Vector3;
    private sphereOpen = false;
    private counters:Record<Side, {canvas:HTMLCanvasElement, texture:Texture, value:number}> = {player:null, opponent:null};
    private zones:Record<Side, Record<Row, Mesh[]>> = {player:{front:[], back:[]}, opponent:{front:[], back:[]}};
    private field:Record<Side, Record<Row, FieldCard[]>> = {player:{front:[], back:[]}, opponent:{front:[], back:[]}};
    // The card being dragged, then held over where it was dropped until the server answers
    private drag:{card:GameCard, object:Object3D, target:DropTarget} = null;
    private held:{cardID:string, object:Object3D} = null;
    private tweens:Tween[] = [];
    private frame:number = null;
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

        (Object.keys(DECKS) as Side[]).forEach((side)=>{
            const box = new Box3().setFromObject(this.scene.getObjectByName(DECKS[side]));
            // On top of the deck, a little above it so the counter by the deck stays visible
            this.decks[side] = box.getCenter(new Vector3()).setY(box.max.y + 0.002);
            this.makeCounter(side);
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
        const fieldCard:FieldCard = {cardID:card.id, look:null, object};
        this.setLook(fieldCard, card);
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
    private setLook(fieldCard:FieldCard, card:GameCard){
        const look = card.isHidden || !isKnown(card) || !card.imagePath ? "back" : card.imagePath;
        if(fieldCard.look === look){
            return;
        }
        fieldCard.look = look;
        this.setMaterial(fieldCard.object, look === "back" ? this.squareBackMaterial : this.squareMaterial(look));
    }

    private squareMaterial(imagePath:string):Material{
        if(!this.squareMaterials.has(imagePath)){
            const material = unlit({color:0x333333});
            squareCanvas(imagePath).then((canvas)=>{
                material.map = this.texture(canvas);
                material.color.set(0xffffff);
                material.needsUpdate = true;
            }, (e)=>{console.log("card picture failed", imagePath, e)});
            this.squareMaterials.set(imagePath, material);
        }
        return this.squareMaterials.get(imagePath);
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
        const label = new Mesh(new PlaneGeometry(size.x, size.z), unlit({map:texture, transparent:true, depthWrite:false}));
        label.rotation.x = -Math.PI / 2;
        label.position.copy(box.getCenter(new Vector3())).setY(box.max.y + 0.0004);
        this.scene.add(label);
        this.counters[side] = {canvas, texture, value:null};
        this.setResources(side, 0);
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

    // The card leaves the hand as a SquareCard floating under the pointer
    startDrag(card:GameCard, x:number, y:number){
        this.cancelDrag();
        const object = this.square(isKnown(card) && card.imagePath ? this.squareMaterial(card.imagePath) : this.squareBackMaterial);
        object.scale.setScalar(DRAG_SCALE);
        this.scene.add(object);
        this.drag = {card, object, target:null};
        this.moveDrag(x, y, ()=>false);
    }

    // Follows the pointer and finds what the card is over: the sphere (it opens) or one of the
    // player's zones where canPlace allows the card (it glows)
    moveDrag(x:number, y:number, canPlace:(row:Row, index:number)=>boolean):DropTarget{
        if(!this.drag){
            return null;
        }
        const point = this.pointerPoint(x, y, DRAG_HEIGHT);
        if(!point){
            return this.drag.target;
        }
        this.drag.object.position.copy(point);
        let target:DropTarget = null;
        if(Math.hypot(point.x - this.sphere.x, point.z - this.sphere.z) < SPHERE_REACH){
            target = {kind:"sphere"};
        }
        else{
            for(const row of ["front", "back"] as Row[]){
                for(let i = 0; i < 5; i++){
                    const slot = this.slotPosition("player", row, i);
                    if(Math.abs(point.x - slot.x) < (SLOT + SLOT_GAP) / 2 && Math.abs(point.z - slot.z) < (SLOT + SLOT_GAP) / 2 && canPlace(row, i)){
                        target = {kind:"zone", row, index:i};
                    }
                }
            }
        }
        this.drag.target = target;
        this.setSphereOpen(target !== null && target.kind === "sphere");
        this.glow(target && target.kind === "zone" ? target : null);
        return target;
    }

    // The card is let go: over a target it stays there, held, until the server answers
    // (sacrificeHeld, syncField or cancelHeld); elsewhere it is gone. Returns the target.
    dropDrag():DropTarget{
        if(!this.drag){
            return null;
        }
        const {card, object, target} = this.drag;
        this.drag = null;
        this.glow(null);
        if(!target){
            object.removeFromParent();
            this.setSphereOpen(false);
            return null;
        }
        this.held = {cardID:card.id, object};
        return target;
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
            this.drag = null;
        }
        this.glow(null);
    }

    private glow(zone:{row:Row, index:number}){
        (["front", "back"] as Row[]).forEach((row)=>{
            this.zones.player[row].forEach((mesh, i)=>{
                const on = zone !== null && zone.row === row && zone.index === i;
                const material = mesh.material as MeshBasicMaterial;
                material.opacity = on ? ZONE_GLOW_OPACITY : ZONE_OPACITY;
                material.color.set(on ? 0xffd27a : 0xffffff);
                mesh.scale.setScalar(on ? ZONE_GLOW_SCALE : 1);
            });
        });
    }

    //helpers---------------------------------------------------------------------------------

    private square(material:Material):Object3D{
        const object = this.squareTemplate.clone(true);
        this.setMaterial(object, material);
        return object;
    }

    private setMaterial(object:Object3D, material:Material){
        object.traverse((o)=>{
            if((o as Mesh).isMesh){
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

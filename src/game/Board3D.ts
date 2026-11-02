import {Box3, CanvasTexture, Euler, Material, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, Quaternion, sRGBEncoding, Vector3} from "three";
import {Engine3D} from "./Engine3D";
import {cardCanvas} from "./cardTexture";
import {CardFace} from "../components/CardView";

// Assets of the threngine project
const CARD_GEOMETRY = "75lh4pn8";    // "cardGame": the meshes Card_Front and Card_Back
const CARD_BACK_MATERIAL = "b0g6q05i";    // "card_border", the back the decks show
// The deck meshes in the play area: the player sits on the near side
const DECKS = {player:"Deck1", opponent:"Deck"};

const DRAW_TIME = 550;
// How high a drawn card lifts off the deck, in m
const DRAW_ARC = 0.03;
// Drawn above everything else in the scene
const RENDER_ORDER = 1000;

export type Side = "player" | "opponent";

interface Flight{
    card:Object3D;
    start:{position:Vector3, rotation:Quaternion};
    startTime:number;
    // Where the card lands on screen: read every frame, so the card follows the hand as it moves
    target:()=>DOMRect;
    faceUp:boolean;
    done:()=>void;
}

const easeInOut = (t:number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
// The card lies face up (front along +Y, top towards -Z); these turn it to face the camera
const FACING_CAMERA = new Quaternion().setFromEuler(new Euler(Math.PI / 2, 0, 0));
const BACK_TO_CAMERA = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0));
const FACE_DOWN = new Quaternion().setFromEuler(new Euler(0, 0, Math.PI));

// The 3D cards of a match on top of the play area: for now, cards flying from a deck to a hand
export class Board3D{
    private template:Object3D;
    private backMaterial:Material;
    // The card's length in m, which the hand card's height matches when it lands
    private cardLength:number;
    private decks:Record<Side, Vector3> = {player:null, opponent:null};
    private flights:Flight[] = [];
    private frame:number = null;
    private stopped = false;

    constructor(private engine:Engine3D){}

    // Loads the card model and finds the decks; call once the scene is up
    async prepare(){
        const services = this.engine.engine.services;
        const [template, back] = await Promise.all([
            services.geometry.getClone(CARD_GEOMETRY),
            services.material.getMaterial(CARD_BACK_MATERIAL),
        ]);
        // The back's picture, unlit like the front (a copy of the project's shader material draws black)
        const backMap = (back.getMaterials()[0] as any).map;
        this.backMaterial = new MeshBasicMaterial({map:backMap, toneMapped:false, depthTest:false});
        this.template = template;
        const size = new Box3().setFromObject(template).getSize(new Vector3());
        this.cardLength = size.z;
        const scene = services.render.scene;
        (Object.keys(DECKS) as Side[]).forEach((side)=>{
            const box = new Box3().setFromObject(scene.getObjectByName(DECKS[side]));
            // On top of the deck, a little above it so the counter by the deck stays visible
            this.decks[side] = box.getCenter(new Vector3()).setY(box.max.y + 0.002);
        });
    }

    // The card back's picture, for the hands drawn in HTML
    get backImage():string{
        const map = (this.backMaterial as any).map;
        return map && map.image ? map.image.src : "";
    }

    // A card flies face down from the side's deck to where target() is on screen, turning face up
    // on the way if a face is given. Resolves when it lands; the 3D card is gone by then.
    drawCard(side:Side, face:CardFace, target:()=>DOMRect):Promise<void>{
        if(this.stopped || !this.template){
            return Promise.resolve();
        }
        const card = this.template.clone(true);
        const front = new MeshBasicMaterial({color:0x222222, toneMapped:false, depthTest:false});
        card.traverse((o)=>{
            if((o as Mesh).isMesh){
                (o as Mesh).material = o.name === "Card_Front" ? front : this.backMaterial;
                o.renderOrder = RENDER_ORDER;
            }
        });
        if(face){
            cardCanvas(face).then((canvas)=>{
                const map = new CanvasTexture(canvas);
                map.flipY = false;
                map.encoding = sRGBEncoding;
                front.map = map;
                front.color.set(0xffffff);
                front.needsUpdate = true;
            }, (e)=>{console.log("card picture failed", e)});
        }
        card.position.copy(this.decks[side]);
        card.quaternion.copy(FACE_DOWN);
        this.engine.engine.services.render.scene.add(card);
        return new Promise((resolve)=>{
            this.flights.push({card, start:{position:card.position.clone(), rotation:card.quaternion.clone()}, startTime:performance.now(), target, faceUp:!!face, done:()=>{
                card.removeFromParent();
                front.map?.dispose();
                front.dispose();
                resolve();
            }});
            if(this.frame === null){
                this.frame = requestAnimationFrame(this.animate);
            }
        });
    }

    stop(){
        this.stopped = true;
        if(this.frame !== null){
            cancelAnimationFrame(this.frame);
        }
        this.flights.forEach(f => f.done());
        this.flights = [];
    }

    private animate = (now:number)=>{
        this.flights = this.flights.filter((flight)=>{
            const t = Math.min(1, (now - flight.startTime) / DRAW_TIME);
            const end = this.screenPose(flight.target(), flight.faceUp);
            const e = easeInOut(t);
            if(end){
                flight.card.position.lerpVectors(flight.start.position, end.position, e);
                flight.card.position.y += Math.sin(Math.PI * e) * DRAW_ARC;
                flight.card.quaternion.slerpQuaternions(flight.start.rotation, end.rotation, e);
            }
            if(t >= 1){
                flight.done();
                return false;
            }
            return true;
        });
        this.frame = this.flights.length > 0 ? requestAnimationFrame(this.animate) : null;
    }

    // Where the card has to be to cover this part of the screen exactly, facing the camera
    private screenPose(rect:DOMRect, faceUp:boolean):{position:Vector3, rotation:Quaternion}{
        if(!rect || rect.height <= 0){
            return null;
        }
        const camera = this.engine.engine.services.render.camera as PerspectiveCamera;
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

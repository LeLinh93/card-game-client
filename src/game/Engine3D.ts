import {AssetProvider, AssetProviderMode, Configurator, Engine} from "@viscircle-org/threngine";

// The threngine project with the 3D play area, as in dora-frontend's Engine3D
const assetProviderConfig = {
    project_id: "64b116765f6544fe4b981308",
    mode: AssetProviderMode.Live,
    custom_dev_endpoint: "https://srv.3dcommerce.studio",
    server: "https://srv.3dcommerce.studio",
};

// Loads the play area's 3D scene into a div and draws it until stopped
export class Engine3D {
    private _assetProvider:AssetProvider;
    private _engine:Engine;
    private _configurator:Configurator;
    private _mount:HTMLDivElement;
    private _stopped = false;

    public get engine():Engine{
        return this._engine;
    }

    public get configurator():Configurator{
        return this._configurator;
    }

    public async initialize(mount:HTMLDivElement):Promise<void>{
        this._mount = mount;
        this._assetProvider = new AssetProvider(assetProviderConfig);
        this._engine = new Engine(this._assetProvider);
        await this._engine.initialize(mount);
        const sceneConfig = this._assetProvider.getAssets().find(a => a.infoType === "SCENE").info.data;
        this._configurator = new Configurator(sceneConfig, this._engine);
        const scene = await this._configurator.initialize();
        // Left the match while the scene was loading
        if(this._stopped){
            return this.stop();
        }
        this._engine.services.render.setScene(scene);
    }

    public stop(){
        this._stopped = true;
        if(!this._engine || !this._engine._initialized){
            return;
        }
        try{
            this._engine.stop();
        }
        catch(e){
            console.log(e);
        }
        this._mount.replaceChildren();
    }
}

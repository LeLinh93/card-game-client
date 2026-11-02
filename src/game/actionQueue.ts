// The game's messages are played back one after another, like the Unity client's action queue:
// an action starts once the one before it is done (an animation may let the next one start early).
export class ActionQueue{
    private actions:(()=>Promise<void>)[] = [];
    private running = false;
    private stopped = false;

    add(action:()=>Promise<void> | void){
        if(this.stopped){
            return;
        }
        this.actions.push(async ()=>{await action()});
        if(!this.running){
            this.run();
        }
    }

    stop(){
        this.stopped = true;
        this.actions = [];
    }

    private async run(){
        this.running = true;
        while(this.actions.length > 0 && !this.stopped){
            try{
                await this.actions.shift()();
            }
            catch(e){
                console.log("game action failed", e);
            }
        }
        this.running = false;
    }
}

export const wait = (ms:number) => new Promise<void>(resolve => setTimeout(resolve, ms));

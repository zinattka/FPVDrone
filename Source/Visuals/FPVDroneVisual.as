package {
    import flash.display.MovieClip;
    import flash.display.DisplayObjectContainer;
    import flash.events.Event;

    // Executable equivalent is emitted by Tools/build_fpv_visuals.py.
    public dynamic class FPVDroneVisual extends MovieClip {
        public function FPVDroneVisual() {
            super();
            visible = false;
            mouseEnabled = false;
            mouseChildren = false;
            addEventListener("enterFrame", onFrame);
        }

        public function onFrame(event:Event):void {
            var target:DisplayObjectContainer = root as DisplayObjectContainer;
            if (!target) return;
            target = target.getChildByName("FPVDroneCanvas") as DisplayObjectContainer;
            if (!target) return;
            target = target.getChildByName("FPVDroneThrottle") as DisplayObjectContainer;
            if (!target) return;
            target = target.getChildByName("fpvView") as DisplayObjectContainer;
            if (!target) return;
            target.addChildAt(this, 0);
            visible = true;
            removeEventListener("enterFrame", onFrame);
        }
    }
}

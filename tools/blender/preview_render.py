"""Quick Cycles preview of the built mannequin .blend (for pipeline iteration only).
blender -b /tmp/bl/mq.blend --python tools/blender/preview_render.py -- out.png [head|full] [morph=value,...]
"""
import bpy, sys, math
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
out = argv[0] if argv else "/tmp/bl/preview.png"
mode = argv[1] if len(argv) > 1 else "full"
morphs = {}
if len(argv) > 2 and argv[2]:
    for kv in argv[2].split(","):
        k, v = kv.split("=")
        morphs[k] = float(v)

scene = bpy.context.scene
for o in list(scene.objects):
    if o.type != "MESH" or not (o.name.startswith("MannequinBody") or o.name.startswith("garment_")):
        o.hide_render = True
for o in scene.objects:
    if o.type == "MESH" and o.data.shape_keys:
        for kb in o.data.shape_keys.key_blocks[1:]:
            kb.value = morphs.get(kb.name, 0.0)

def mat(name, color, rough=0.5, sss=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nodes = nt.nodes
    links = nt.links
    b = nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    if sss:
        b.inputs["Subsurface Weight"].default_value = sss
        b.inputs["Subsurface Radius"].default_value = (1.0, 0.35, 0.2)
        b.inputs["Subsurface Scale"].default_value = 0.01
    else:
        # Wire COLOR_0 vertex attribute so multi-zone procedural accessories
        # render metallic hardware (R=1,G=0,B=0), watch dial (R=0,G=1,B=0),
        # and optical glass (R=0,G=0,B=1) distinctly from primary garment cloth.
        attr = nodes.new("ShaderNodeAttribute")
        attr.attribute_name = "COLOR_0"
        sep = nodes.new("ShaderNodeSeparateColor")
        links.new(attr.outputs["Color"], sep.inputs["Color"])

        # Zone masks: metal = R*(1-G), dial = G*(1-R), glass = B*(1-R)
        inv_g = nodes.new("ShaderNodeMath"); inv_g.operation = "SUBTRACT"; inv_g.inputs[0].default_value = 1.0
        links.new(sep.outputs["Green"], inv_g.inputs[1])
        metal_m = nodes.new("ShaderNodeMath"); metal_m.operation = "MULTIPLY"; metal_m.use_clamp = True
        links.new(sep.outputs["Red"], metal_m.inputs[0])
        links.new(inv_g.outputs[0], metal_m.inputs[1])

        inv_r = nodes.new("ShaderNodeMath"); inv_r.operation = "SUBTRACT"; inv_r.inputs[0].default_value = 1.0
        links.new(sep.outputs["Red"], inv_r.inputs[1])
        dial_m = nodes.new("ShaderNodeMath"); dial_m.operation = "MULTIPLY"; dial_m.use_clamp = True
        links.new(sep.outputs["Green"], dial_m.inputs[0])
        links.new(inv_r.outputs[0], dial_m.inputs[1])

        glass_m = nodes.new("ShaderNodeMath"); glass_m.operation = "MULTIPLY"; glass_m.use_clamp = True
        links.new(sep.outputs["Blue"], glass_m.inputs[0])
        links.new(inv_r.outputs[0], glass_m.inputs[1])

        mix_metal = nodes.new("ShaderNodeMix")
        mix_metal.data_type = "RGBA"
        mix_metal.inputs["A"].default_value = (*color, 1.0)
        mix_metal.inputs["B"].default_value = (0.86, 0.87, 0.89, 1.0)
        links.new(metal_m.outputs[0], mix_metal.inputs["Factor"])

        mix_dial = nodes.new("ShaderNodeMix")
        mix_dial.data_type = "RGBA"
        mix_dial.inputs["B"].default_value = (0.96, 0.96, 0.97, 1.0)
        links.new(dial_m.outputs[0], mix_dial.inputs["Factor"])
        links.new(mix_metal.outputs["Result"], mix_dial.inputs["A"])

        mix_glass = nodes.new("ShaderNodeMix")
        mix_glass.data_type = "RGBA"
        mix_glass.inputs["B"].default_value = (0.88, 0.92, 0.95, 1.0)
        links.new(glass_m.outputs[0], mix_glass.inputs["Factor"])
        links.new(mix_dial.outputs["Result"], mix_glass.inputs["A"])

        links.new(mix_glass.outputs["Result"], b.inputs["Base Color"])
        links.new(metal_m.outputs[0], b.inputs["Metallic"])
        if "Transmission Weight" in b.inputs:
            links.new(glass_m.outputs[0], b.inputs["Transmission Weight"])
    return m

skin = mat("skin", (0.80, 0.62, 0.52), 0.45, 0.3)
palette = [(0.12, 0.14, 0.2), (0.75, 0.72, 0.66), (0.9, 0.9, 0.88), (0.3, 0.2, 0.15)]
gi = 0
for o in scene.objects:
    if o.name.startswith("MannequinBody"):
        o.data.materials.clear(); o.data.materials.append(skin)
    elif o.name.startswith("garment_"):
        o.data.materials.clear(); o.data.materials.append(mat("g%d" % gi, palette[gi % 4], 0.7)); gi += 1

cam_data = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
if mode == "head":
    cam_data.lens = 85
    target = Vector((0, 0, 1.50))
    cam.location = Vector((0.35, -1.0, 1.55))
elif mode == "side":
    cam_data.lens = 50
    target = Vector((0, 0, 0.82))
    cam.location = Vector((4.0, 0, 0.9))
else:
    cam_data.lens = 50
    target = Vector((0, 0, 0.82))
    cam.location = Vector((1.2, -3.8, 1.0))
d = target - cam.location
cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()

ld = bpy.data.lights.new("key", "AREA"); ld.energy = 600; ld.size = 2
lo = bpy.data.objects.new("key", ld); scene.collection.objects.link(lo)
lo.location = (2.0, -2.5, 3.0); lo.rotation_euler = (Vector((0, 0, 1)) - lo.location).to_track_quat("-Z", "Y").to_euler()
ld2 = bpy.data.lights.new("rim", "AREA"); ld2.energy = 300; ld2.size = 2
lo2 = bpy.data.objects.new("rim", ld2); scene.collection.objects.link(lo2)
lo2.location = (-2.0, 2.0, 2.0); lo2.rotation_euler = (Vector((0, 0, 1)) - lo2.location).to_track_quat("-Z", "Y").to_euler()
world = scene.world or bpy.data.worlds.new("w"); scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.85, 0.83, 0.8, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.6

scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.resolution_x = 520 if mode != "head" else 600
scene.render.resolution_y = 900 if mode != "head" else 600
scene.render.filepath = out
bpy.ops.render.render(write_still=True)

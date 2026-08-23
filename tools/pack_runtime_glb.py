"""Pack Meshy GLBs for the Three.js runtime: center, orient, decimate, shrink textures.

Run:
  blender --background --python tools/pack_runtime_glb.py
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(r"I:\kimi\wingcommander")
SRC = ROOT / "source_assets" / "meshy"
OUT = ROOT / "assets" / "models"

# kind: ship (longest -> Blender +Y / glTF +Z), tower (longest -> Blender +Z / glTF +Y),
# prop (just center).
JOBS = [
    {"name": "confed_interceptor", "kind": "ship", "tris": 3500, "tex": 1024},
    {"name": "kil_drone", "kind": "ship", "tris": 1600, "tex": 512},
    {"name": "kil_gunner", "kind": "ship", "tris": 2000, "tex": 512},
    {"name": "kil_ace", "kind": "ship", "tris": 2400, "tex": 1024},
    {"name": "beacon_tower", "kind": "tower", "tris": 1600, "tex": 512},
    {"name": "swarm_missile", "kind": "ship", "tris": 500, "tex": 256},
    {"name": "xp_gem", "kind": "prop", "tris": 350, "tex": 256},
    {"name": "repair_capsule", "kind": "prop", "tris": 400, "tex": 256},
]


def triangle_count(meshes: list) -> int:
    total = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        total += len(obj.data.loop_triangles)
    return total


def world_aabb(obj):
    xs, ys, zs = [], [], []
    mat = obj.matrix_world
    for v in obj.data.vertices:
        c = mat @ v.co
        xs.append(c.x)
        ys.append(c.y)
        zs.append(c.z)
    mn = Vector((min(xs), min(ys), min(zs)))
    mx = Vector((max(xs), max(ys), max(zs)))
    return mn, mx, mx - mn


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def join_meshes() -> bpy.types.Object:
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise RuntimeError("No mesh in scene")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    # drop leftover empties from the glTF wrapper
    for obj in list(bpy.context.scene.objects):
        if obj != body:
            bpy.data.objects.remove(obj, do_unlink=True)
    return body


def rotate_so_axis_is(obj, src_axis: str, dst_axis: str):
    """Rotate 90-degree steps so src_axis becomes dst_axis."""
    if src_axis == dst_axis:
        return
    mapping = {
        ("x", "y"): ("Z", math.pi / 2),
        ("y", "x"): ("Z", -math.pi / 2),
        ("z", "y"): ("X", -math.pi / 2),
        ("y", "z"): ("X", math.pi / 2),
        ("x", "z"): ("Y", -math.pi / 2),
        ("z", "x"): ("Y", math.pi / 2),
    }
    axis, angle = mapping[(src_axis, dst_axis)]
    obj.rotation_euler.rotate_axis(axis, angle)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def orient(obj, kind: str):
    _mn, _mx, size = world_aabb(obj)
    axes = sorted(
        (("x", size.x), ("y", size.y), ("z", size.z)),
        key=lambda item: item[1],
        reverse=True,
    )
    longest = axes[0][0]
    if kind == "ship":
        # Blender +Y exports as glTF +Z. Three.js lookAt uses -Z, so we
        # flip 180 after aligning length to Y.
        rotate_so_axis_is(obj, longest, "y")
        obj.rotation_euler.rotate_axis("Z", math.pi)
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        mn, mx, size = world_aabb(obj)
        if size.z > size.x:
            rotate_so_axis_is(obj, "z", "x")
    elif kind == "tower":
        rotate_so_axis_is(obj, longest, "z")


def recenter(obj, kind: str):
    mn, mx, size = world_aabb(obj)
    if kind == "tower":
        # origin at ground center
        offset = Vector(((mn.x + mx.x) * 0.5, (mn.y + mx.y) * 0.5, mn.z))
    else:
        offset = (mn + mx) * 0.5
    obj.location -= offset
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    # unit scale: longest dimension = 1
    _mn, _mx, size = world_aabb(obj)
    longest = max(size.x, size.y, size.z) or 1.0
    obj.scale = (1.0 / longest, 1.0 / longest, 1.0 / longest)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def decimate(obj, target: int):
    obj.data.calc_loop_triangles()
    current = len(obj.data.loop_triangles)
    if current <= target:
        return current
    ratio = max(0.02, min(1.0, target / current))
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    modifier = obj.modifiers.new(name="GameDecimate", type="DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = ratio
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def shrink_textures(max_size: int):
    for image in bpy.data.images:
        if image.size[0] <= 0 or image.size[1] <= 0:
            continue
        longest = max(image.size)
        if longest > max_size:
            scale = max_size / longest
            image.scale(max(1, round(image.size[0] * scale)), max(1, round(image.size[1] * scale)))
            image.pack()


def pack_one(job: dict) -> dict:
    reset_scene()
    src = SRC / job["name"] / f"{job['name']}_textured.glb"
    dst = OUT / f"{job['name']}.glb"
    if not src.is_file():
        raise FileNotFoundError(src)
    bpy.ops.import_scene.gltf(filepath=str(src))
    body = join_meshes()
    before = triangle_count([body])
    orient(body, job["kind"])
    recenter(body, job["kind"])
    after = decimate(body, job["tris"])
    shrink_textures(job["tex"])
    dst.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(dst),
        export_format="GLB",
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="JPEG",
        export_animations=False,
        export_cameras=False,
        export_lights=False,
    )
    mn, mx, size = world_aabb(body)
    report = {
        "name": job["name"],
        "kind": job["kind"],
        "src": str(src),
        "dst": str(dst),
        "bytes": dst.stat().st_size,
        "tris_in": before,
        "tris_out": after,
        "size": [round(size.x, 4), round(size.y, 4), round(size.z, 4)],
    }
    print(json.dumps(report), flush=True)
    return report


def main() -> None:
    reports = []
    for job in JOBS:
        reports.append(pack_one(job))
    out = OUT / "pack_report.json"
    out.write_text(json.dumps(reports, indent=2), encoding="utf-8")
    print("PACK_DONE", out)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"PACK_ERROR: {exc}", file=sys.stderr)
        raise

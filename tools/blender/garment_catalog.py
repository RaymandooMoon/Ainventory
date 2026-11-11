"""
Garment catalog: maps A inventory's 11 wardrobe slots and all subcategories to CC0 MakeHuman
community clothes (https://static.makehumancommunity.org/assets/assetpacks.html) or to
high-detail procedural meshes fitted to the MakeHuman base mesh in `build_mannequin.py`.
"""

GARMENTS = {
    # 1. headwear
    "headwear_beanie": {
        "slot": "headwear", "subs": ["beanie"],
        "src": "aethelraed_unraed_cloche_hat/aethelraed_unraed_cloche_hat.mhclo",
        "label": "Knit beanie / cloche", "fabric": "knit", "offset": 0.003, "cull_body": False,
    },
    "headwear_cap": {
        "slot": "headwear", "subs": ["cap"],
        "src": "toigo_maga_hat/toigo_maga_hat.mhclo",
        "label": "Baseball cap", "fabric": "cotton", "offset": 0.002, "cull_body": False,
    },
    "headwear_beret": {
        "slot": "headwear", "subs": ["beret"],
        "src": "jujube_newsboy_cap/jujube_newsboy_cap.mhclo",
        "label": "Beret / newsboy cap", "fabric": "wool", "offset": 0.002, "cull_body": False,
    },
    "headwear_fedora": {
        "slot": "headwear", "subs": ["bucket_hat"],
        "src": "fedora01/fedora01.mhclo",
        "label": "Fedora / bucket hat", "fabric": "wool", "offset": 0.002, "cull_body": False,
    },

    # 2. neckwear
    "neckwear_scarf": {
        "slot": "neckwear", "subs": ["scarf", "muffler"],
        "procedural": "scarf",
        "physics": "soft_jiggle_muffler",
        "label": "Cashmere fringed muffler", "fabric": "wool", "offset": 0.0, "cull_body": False,
    },
    "neckwear_tie": {
        "slot": "neckwear", "subs": ["necktie"],
        "src": "toigo_male_suit_3/toigo_male_suit_3.mhclo",
        "keep_parts": lambda p: 600 <= p["n"] <= 700,
        "physics": "soft_jiggle_tie",
        "label": "Silk necktie", "fabric": "silk", "offset": 0.006, "cull_body": False,
    },

    # 3. outer
    "outer_blazer": {
        "slot": "outer", "subs": ["blazer", "cardigan"],
        "src": "toigo_male_suit_3/toigo_male_suit_3.mhclo",
        "keep_parts": lambda p: p["n"] > 3000 or p["n"] <= 100,
        "physics": "drape_wind_garment",
        "label": "Tailored wool blazer", "fabric": "wool", "offset": 0.006, "cull_body": True,
    },
    "outer_coat": {
        "slot": "outer", "subs": ["coat", "trench"],
        "src": "toigo_male_double-breasted_suit/toigo_male_double-breasted_suit.mhclo",
        "keep_parts": lambda p: (1500 < p["n"] < 1710 and p["xspan"] > 0.8) or p["n"] <= 100,
        "post": "extend_coat",
        "physics": "hem_sway_coat",
        "label": "Double-breasted coat / trench", "fabric": "wool", "offset": 0.007, "cull_body": True,
    },
    "outer_jacket": {
        "slot": "outer", "subs": ["jacket", "padding"],
        "src": "male_casualsuit05/male_casualsuit05.mhclo",
        "keep_parts": lambda p: p["n"] > 1500 or p["n"] < 300,
        "physics": "drape_wind_garment",
        "label": "Quilted / utility jacket", "fabric": "padding", "offset": 0.007, "cull_body": True,
    },

    # 4. top
    "top_knit": {
        "slot": "top", "subs": ["knit"],
        "src": "toigo_fisherman_sweater/toigo_fisherman_sweater.mhclo",
        "physics": "drape_wind_garment",
        "label": "Merino crewneck knit", "fabric": "knit", "offset": 0.002,
    },
    "top_shirt": {
        "slot": "top", "subs": ["shirt", "blouse"],
        "src": "male_casualsuit03/male_casualsuit03.mhclo",
        "keep_parts": lambda p: p["n"] > 1200,
        "physics": "drape_wind_garment",
        "label": "Oxford / silk shirt", "fabric": "cotton", "offset": 0.002,
    },
    "top_tshirt": {
        "slot": "top", "subs": ["tshirt"],
        "src": "toigo_basic_tucked_t-shirt/toigo_basic_tucked_t-shirt.mhclo",
        "physics": "drape_wind_garment",
        "label": "Supima cotton T-shirt", "fabric": "cotton", "offset": 0.002,
    },
    "top_sweatshirt": {
        "slot": "top", "subs": ["sweatshirt", "hoodie"],
        "src": "male_casualsuit02/male_casualsuit02.mhclo",
        "keep_parts": lambda p: p["n"] > 1000,
        "physics": "drape_wind_garment",
        "label": "French terry sweatshirt", "fabric": "cotton", "offset": 0.0025,
    },
    "top_cardigan": {
        "slot": "top", "subs": ["cardigan"],
        "src": "namuhekam_male_polo_shirt/namuhekam_male_polo_shirt.mhclo",
        "physics": "drape_wind_garment",
        "label": "Collared knit / polo", "fabric": "knit", "offset": 0.002,
    },

    # 5. bottom
    "bottom_slacks": {
        "slot": "bottom", "subs": ["slacks"],
        "src": "toigo_wool_pants/toigo_wool_pants.mhclo",
        "physics": "drape_wind_garment",
        "label": "Wide wool slacks", "fabric": "wool", "offset": 0.0025,
    },
    "bottom_denim": {
        "slot": "bottom", "subs": ["denim", "chinos", "jogger"],
        "src": "toigo_male_suit_3/toigo_male_suit_3.mhclo",
        "keep_parts": lambda p: 1900 < p["n"] < 2200,
        "label": "Straight denim / chinos", "fabric": "denim", "offset": 0.0025,
    },
    "bottom_skirt": {
        "slot": "bottom", "subs": ["skirt"],
        "src": "toigo_long_full_skirt/toigo_long_full_skirt.mhclo",
        "physics": "hem_sway_skirt",
        "label": "Pleated full skirt", "fabric": "cotton", "offset": 0.002,
    },
    "bottom_shorts": {
        "slot": "bottom", "subs": ["shorts"],
        "src": "cortu_jeans_shorts/cortu_jeans_shorts.mhclo",
        "physics": "drape_wind_garment",
        "label": "Tailored shorts", "fabric": "denim", "offset": 0.002,
    },

    # 6. dress
    "dress_shift": {
        "slot": "dress", "subs": ["dress"],
        "src": "toigo_shift_dress/toigo_shift_dress.mhclo",
        "physics": "hem_sway_skirt",
        "label": "Belted midi dress", "fabric": "cotton", "offset": 0.0025,
    },
    "dress_onepiece": {
        "slot": "dress", "subs": ["onepiece"],
        "src": "toigo_halter_dress_midi/toigo_halter_dress_midi.mhclo",
        "physics": "hem_sway_skirt",
        "label": "Knit long one-piece", "fabric": "knit", "offset": 0.0025,
    },

    # 7. gloves
    "gloves_short": {
        "slot": "gloves", "subs": ["gloves", "leather_gloves", "knit_gloves"],
        "src": "toigo_gloves_short/toigo_gloves_short.mhclo",
        "label": "Nappa leather / wool gloves", "fabric": "leather", "offset": 0.0022,
        "cull_body": False,
    },

    # 8. underwear
    "underwear_top": {
        "slot": "underwear", "subs": ["inner_top"],
        "src": "female_sportsuit01/female_sportsuit01.mhclo",
        "keep_parts": lambda p: p["n"] > 900,
        "label": "Seamless thermal inner top", "fabric": "cotton", "offset": 0.001, "cull_body": False,
    },
    "underwear_briefs": {
        "slot": "underwear", "subs": ["underwear"],
        "procedural": "briefs",
        "label": "Cotton briefs", "fabric": "cotton", "offset": 0.0, "cull_body": False,
    },

    # 9. socks
    "socks_crew": {
        "slot": "socks", "subs": ["crew_socks"],
        "src": "joepal_crude_high_socks/joepal_crude_high_socks.mhclo",
        "label": "Merino rib crew socks", "fabric": "knit", "offset": 0.001, "cull_body": False,
    },
    "socks_ankle": {
        "slot": "socks", "subs": ["socks"],
        "src": "joepal_crude_low_socks/joepal_crude_low_socks.mhclo",
        "label": "Daily ankle socks", "fabric": "knit", "offset": 0.001, "cull_body": False,
    },

    # 10. shoes
    "shoes_sneakers": {
        "slot": "shoes", "subs": ["sneakers"],
        "src": "shoes05/shoes05.mhclo",
        "keep_parts": lambda p: p["n"] > 300,
        "label": "Minimal court sneakers", "fabric": "leather", "offset": 0.001,
    },
    "shoes_loafers": {
        "slot": "shoes", "subs": ["loafers"],
        "src": "shoes01/shoes01.mhclo",
        "keep_parts": lambda p: p["n"] > 300,
        "label": "Goodyear-welt penny loafers", "fabric": "leather", "offset": 0.001,
    },
    "shoes_boots": {
        "slot": "shoes", "subs": ["boots"],
        "src": "toigo_ankle_boots_male/toigo_ankle_boots_male.mhclo",
        "label": "Chelsea ankle boots", "fabric": "leather", "offset": 0.001,
    },
    "shoes_heels": {
        "slot": "shoes", "subs": ["heels"],
        "src": "toigo_ankle_boots_female/toigo_ankle_boots_female.mhclo",
        "label": "Sculpted heels", "fabric": "leather", "offset": 0.001,
    },

    # 11. accessory & handheld bags (with multi-material PBR zones + pendulum jiggle physics!)
    "accessory_bag": {
        "slot": "accessory", "subs": ["bag"],
        "procedural": "bag",
        "physics": "pendulum_crossbody",
        "label": "Structured saddle crossbody bag", "fabric": "leather", "offset": 0.0, "cull_body": False,
    },
    "accessory_briefcase": {
        "slot": "accessory", "subs": ["briefcase"],
        "procedural": "briefcase",
        "mount": "hand_l",
        "physics": "pendulum_briefcase",
        "no_morphs": True,
        "label": "Executive leather briefcase", "fabric": "leather", "offset": 0.0, "cull_body": False,
    },
    "accessory_tote": {
        "slot": "accessory", "subs": ["tote"],
        "procedural": "tote",
        "mount": "hand_l",
        "physics": "pendulum_tote",
        "no_morphs": True,
        "label": "Structured leather shopper tote", "fabric": "leather", "offset": 0.0, "cull_body": False,
    },
    "accessory_belt": {
        "slot": "accessory", "subs": ["belt"],
        "procedural": "belt",
        "label": "Calfskin belt with silver buckle", "fabric": "leather", "offset": 0.0, "cull_body": False,
    },
    "accessory_watch": {
        "slot": "accessory", "subs": ["watch"],
        "procedural": "watch",
        "label": "Minimalist steel dress watch", "fabric": "metal", "offset": 0.0, "cull_body": False,
    },
    "accessory_glasses": {
        "slot": "accessory", "subs": ["glasses"],
        "procedural": "glasses",
        "label": "Acetate optical eyewear", "fabric": "acetate", "offset": 0.0, "cull_body": False,
    },
}

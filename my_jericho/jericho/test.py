from jericho import FrotzEnv
game = "/home/stefano/Projects/Z-AI/ext_libs/z-machine-games/the-large-game-collection/Asylum.z5"
game ="/home/stefano/Projects/Z-AI/ext_libs/z-machine-games/jericho-game-suite/jewel.z5"
game ="/home/stefano/Projects/Z-AI/ext_libs/z-machine-games/jericho-game-suite/lurking.z3"
game = "/home/stefano/Projects/Z-AI/Lurking/lurking/LURKING.DAT"

from jericho import util 
def get_objects():
    po=env.get_player_object()
    wo = env.get_world_objects()
    return util.get_subtree(po.num, wo)

def remove_prefix_from_first_line(text, prefix=">"):
    """Removes the specified prefix only from the start of the first line."""
    
    # Split the string into lines
    lines = text.splitlines()
    
    # Check if there are lines and if the first line starts with the prefix
    if lines and lines[0].startswith(prefix):
        # Remove the prefix using slicing and update the first line
        lines[0] = lines[0][len(prefix):]
        
    # Rejoin the lines back into a single string
    return '\n'.join(lines)

env = FrotzEnv(game)
#print('Recognized Vocabulary Words', list(env.get_dictionary()))
state, infos = env.reset()
print(state)
while True:
    try:
        user_input = input("> ").strip()
    except EOFError:
        print("\n[Exiting]")
        break
    except KeyboardInterrupt:
        # Ctrl+C clears the line, not exit
        print("^C")
        continue
    if user_input == "":
        continue
    if user_input.lower() in ("quit", "exit"):
        print("[Exiting]")
        break

    state, reward, done, infos = env.step(user_input)
    print(remove_prefix_from_first_line(state))
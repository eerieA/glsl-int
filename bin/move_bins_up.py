import os
import shutil

# Root directory containing all the architecture/OS folders
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))

# Loop through all items in the root directory
for subdir in os.listdir(ROOT_DIR):
    full_subdir_path = os.path.join(ROOT_DIR, subdir)
    bin_path = os.path.join(full_subdir_path, "bin")

    # Skip if not a directory or if bin doesn't exist
    if not os.path.isdir(bin_path):        
        print("✨ No bin directory, skipping.")
        continue

    # Move files up and optionally delete .pdb files
    for filename in os.listdir(bin_path):
        src = os.path.join(bin_path, filename)
        dst = os.path.join(full_subdir_path, filename)

        if filename.lower().endswith(".pdb"):
            print(f"Deleting: {src}")
            os.remove(src)
        else:
            print(f"Moving: {src} -> {dst}")
            shutil.move(src, dst)

    # Remove the now-empty bin directory
    print(f"Removing bin directory: {bin_path}")
    os.rmdir(bin_path)

print("✅ Done: Moved binaries up from bin and deleted .pdb files.")

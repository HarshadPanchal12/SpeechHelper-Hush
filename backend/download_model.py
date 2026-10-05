from df.enhance import init_df

print("⏳ Fetching and downloading DeepFilterNet model weights...")

# This single line handles finding, downloading, and loading the model files
model, df_state, _ = init_df()

print("✅ Model downloaded successfully and ready for your website!")

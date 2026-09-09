# Temporary Vulkan pilot

This runtime systemd drop-in enables the installed Vulkan backend and integrated
GPU, disables ROCm discovery for this comparison, and limits loaded models and
parallel inference to one. It does not change BIOS memory reservations or drivers.
Stop other inference workloads before applying it.

```bash
sudo install -D -m 644 /home/roberto/projects/maia-dataset-forge/deploy/ollama-vulkan-test.conf /run/systemd/system/ollama.service.d/90-forge-vulkan-test.conf
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

Verify discovery before starting inference:

```bash
journalctl -u ollama -n 60 --no-pager
```

Run the same batch in a new directory, retaining the CPU result:

```bash
cd /home/roberto/projects/maia-dataset-forge
flock -n data/logs/batch-pilot.lock npm run batch:pilot -- --out data/benchmarks/batch-7b-vulkan 2>&1 | tee data/logs/batch-vulkan.log
```

Confirm layer offload in the Ollama journal and GPU usage in `ollama ps` while
inference is running; detection alone does not prove acceleration. Preserve the
journal evidence along with results. Four CPU threads still apply to CPU work.

Restore the original configuration after the experiment:

```bash
sudo rm /run/systemd/system/ollama.service.d/90-forge-vulkan-test.conf
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

The override also disappears on reboot because it is under /run.

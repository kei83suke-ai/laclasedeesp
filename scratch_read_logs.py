import json

log_path = "/Users/sonodakeisuke/.gemini/antigravity/brain/2645affa-065c-4230-a240-f064b8fef1bb/.system_generated/logs/overview.txt"
with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        if '"step_index":69' in line:
            obj = json.loads(line)
            for call in obj.get('tool_calls', []):
                target = call.get('args', {}).get('TargetFile', '')
                if 'app.js' in target:
                    code = call['args']['CodeContent']
                    # Let's find playAudio in the code
                    idx = code.find('function playAudio')
                    if idx != -1:
                        print(code[idx:idx+800])
                    else:
                        print("playAudio not found, printing start of code:")
                        print(code[:800])

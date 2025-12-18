# TTS Demo

This is a demo application that demonstrates the Text-to-Speech (TTS) feature for custom fields in Ontime.

## Features

- **Monitor Multiple Fields**: Select and monitor multiple custom fields simultaneously
- **Per-Field Configuration**: Set individual threshold, voice, and language for each field
- **Real-Time Monitoring**: Displays current values from active events
- **Visual Feedback**: Shows which fields are currently below threshold
- **Voice Selection**: Choose from available system voices filtered by language
- **Persistent Settings**: Configuration is saved to browser localStorage

## Usage

1. **Access the Demo**: Navigate to `/external/tts-demo` in your Ontime installation
2. **Configure Fields**: 
   - Enable TTS for the fields you want to monitor
   - Set threshold (in seconds) - TTS will trigger when time is below this value
   - Select language and voice for each field
3. **Monitor**: The app will automatically read aloud time values when they fall below the threshold

## How It Works

- Connects to Ontime via WebSocket to receive real-time runtime data
- Fetches custom fields definitions from the API
- Monitors custom field values from `eventNow` and `eventNext`
- Parses time values in `hh:mm:ss` or `mm:ss` format
- Triggers TTS when parsed seconds are below the configured threshold
- Speaks only the numerical seconds value (e.g., "10" instead of "10 seconds")

<img width="1432" height="693" alt="Screenshot 2025-12-18 at 16 51 20" src="https://github.com/user-attachments/assets/057dc372-1aa5-47f7-812f-e5493da4258b" />


## Configuration

Each monitored field can be configured with:
- **Enable/Disable**: Toggle monitoring for the field
- **Threshold**: Time in seconds below which TTS will trigger
- **Language**: Language code for speech synthesis (e.g., en-US, en-GB)
- **Voice**: Specific voice to use (filtered by selected language)

## Notes

- TTS only works in browsers that support the Web Speech API
- Voices available depend on your operating system
- The app monitors both current and next events
- Configuration is saved in browser localStorage
- Only text-type custom fields can be monitored

## Browser Support

- Chrome/Edge: Full support
- Firefox: Full support  
- Safari: Full support

## See Also

- [Ontime Documentation](https://docs.getontime.no)
- [Runtime Data API](https://docs.getontime.no/api/data/runtime-data/)

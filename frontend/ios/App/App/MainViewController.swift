import UIKit
import Capacitor

/// The app's web view controller. Exists only to register plugins that live inside this
/// project (rather than coming from npm), which Capacitor doesn't pick up on its own.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(TrainerHealthPlugin())
    }
}

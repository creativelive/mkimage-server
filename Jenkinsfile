node("build-docker") {


 try {
    stage('clone') {
        /* Let's make sure we have the repository cloned to our workspace */
        checkout scm
        currentBuild.displayName = ""
    }
    withCredentials([
        usernamePassword(credentialsId: 'builder', usernameVariable: 'GIT_USER', passwordVariable: 'GIT_PASSWORD'),
        file(credentialsId: 'npmrc', variable: 'NPM_CONFIG_USERCONFIG')
    ]) {
      runBuildScripts()
    }

 }
 catch (e) {
   echo 'failed'
   echo 'Exception: ' + e.toString()
   throw e
 }
 finally {
         def currentResult = currentBuild.result ?: 'SUCCESS'
         if (currentResult == 'UNSTABLE') {
             echo 'Build is unstable!'
         }

         def previousResult = currentBuild.previousBuild?.result
         if (previousResult != null && previousResult != currentResult) {
             echo 'State of the Pipeline has changed!'
         }
         echo 'Deleting directory...'
         deleteDir()
 }
}

def runBuildScripts() {
  def buildSteps = findFiles(glob: ".build/*")

  buildSteps.each { f ->
   def filename = f.getName()
   def stageName = getStageName(filename);

   if (stageName) {
     stage("${stageName}") {
       sh ".build/${filename}"

       if (fileExists(".${stageName}.tmp")) {
         def info = readFile ".${stageName}.tmp"
         currentBuild.displayName += "${info} "
       }
      }
    }
  }
}

@NonCPS
def getStageName(filename) {
   def match = (filename =~ /.*(?!00)[0-9]{2}-(.+)\.sh/)
   return match.matches()? match[0][1] : null
}